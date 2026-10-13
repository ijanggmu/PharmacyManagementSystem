using FluentValidation;
using FSH.Modules.Notifications.Contracts.v1.Sms;
using FSH.Modules.Notifications.Data;
using FSH.Modules.Notifications.Domain;
using FSH.Modules.Notifications.Sms;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Notifications.Features.v1.Sms;

public sealed class GetSmsSettingsQueryHandler(NotificationsDbContext db) : IQueryHandler<GetSmsSettingsQuery, SmsSettingsDto>
{
    public async ValueTask<SmsSettingsDto> Handle(GetSmsSettingsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        var settings = await db.SmsSettings.AsNoTracking().FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);
        var templates = await db.SmsTemplates.AsNoTracking().ToListAsync(cancellationToken).ConfigureAwait(false);
        return SmsSettingsMapper.ToDto(settings, templates);
    }
}

public sealed class UpdateSmsSettingsCommandHandler(NotificationsDbContext db, SmsSecrets secrets)
    : ICommandHandler<UpdateSmsSettingsCommand, SmsSettingsDto>
{
    public async ValueTask<SmsSettingsDto> Handle(UpdateSmsSettingsCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var settings = await db.SmsSettings.FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);
        if (settings is null)
        {
            settings = SmsSettings.CreateDefault();
            db.SmsSettings.Add(settings);
        }

        settings.Update(
            command.Enabled,
            command.Provider,
            command.SenderId,
            secrets.ProtectOrKeep(command.ApiToken),
            command.PharmacyName,
            command.DefaultLanguage,
            command.ReceiptsEnabled,
            command.AutoDuesReminders,
            command.DuesReminderDays,
            command.AutoRefillReminders,
            command.RefillReminderDays,
            command.QuietHoursStart,
            command.QuietHoursEnd,
            command.MaxPerHour);

        if (settings.Enabled && !settings.IsConfigured)
        {
            throw new ValidationException(
            [
                new FluentValidation.Results.ValidationFailure(
                    nameof(command.Enabled),
                    settings.Provider == SmsProviderNames.Sparrow
                        ? "Sparrow SMS needs the API token and the sender ID before SMS can be turned on."
                        : "The SMS gateway needs its API token before SMS can be turned on."),
            ]);
        }

        var stored = await db.SmsTemplates.ToListAsync(cancellationToken).ConfigureAwait(false);
        foreach (var template in command.Templates ?? [])
        {
            var existing = stored.FirstOrDefault(t => t.Kind == template.Kind && t.Language == template.Language);
            if (existing is null)
            {
                var created = SmsTemplate.Create(template.Kind, template.Language, template.Body);
                db.SmsTemplates.Add(created);
                stored.Add(created);
            }
            else
            {
                existing.SetBody(template.Body);
            }
        }

        await db.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return SmsSettingsMapper.ToDto(settings, stored);
    }
}

public sealed class UpdateSmsSettingsCommandValidator : AbstractValidator<UpdateSmsSettingsCommand>
{
    public UpdateSmsSettingsCommandValidator()
    {
        RuleFor(x => x.Provider)
            .Must(p => SmsProviderNames.All.Contains(p, StringComparer.Ordinal))
            .WithMessage($"Provider must be one of: {string.Join(", ", SmsProviderNames.All)}.");
        RuleFor(x => x.DefaultLanguage)
            .Must(l => SmsLanguages.All.Contains(l, StringComparer.Ordinal))
            .WithMessage("Language must be 'en' or 'ne'.");
        RuleFor(x => x.SenderId).MaximumLength(32);
        RuleFor(x => x.ApiToken).MaximumLength(512);
        RuleFor(x => x.PharmacyName).MaximumLength(80);
        RuleFor(x => x.DuesReminderDays).InclusiveBetween(1, 365);
        RuleFor(x => x.RefillReminderDays).InclusiveBetween(0, 60);
        RuleFor(x => x.QuietHoursStart).InclusiveBetween(0, 23);
        RuleFor(x => x.QuietHoursEnd).InclusiveBetween(0, 23);
        RuleFor(x => x.MaxPerHour).InclusiveBetween(1, 10_000);
        RuleForEach(x => x.Templates).SetValidator(new SmsTemplateDtoValidator());
    }
}

public sealed class SmsTemplateDtoValidator : AbstractValidator<SmsTemplateDto>
{
    public SmsTemplateDtoValidator()
    {
        RuleFor(x => x.Kind)
            .Must(k => SmsKinds.TemplateKinds.Contains(k, StringComparer.Ordinal))
            .WithMessage($"Template kind must be one of: {string.Join(", ", SmsKinds.TemplateKinds)}.");
        RuleFor(x => x.Language)
            .Must(l => SmsLanguages.All.Contains(l, StringComparer.Ordinal))
            .WithMessage("Template language must be 'en' or 'ne'.");
        RuleFor(x => x.Body).NotEmpty().MaximumLength(SmsTemplates.MaxTemplateLength);
        RuleFor(x => x.Body)
            .Must(body => SmsTemplates.UnknownPlaceholders(body).Count == 0)
            .When(x => !string.IsNullOrEmpty(x.Body))
            .WithMessage(x => $"Unknown placeholder(s): {string.Join(", ", SmsTemplates.UnknownPlaceholders(x.Body))}. "
                + $"Use {string.Join(", ", SmsTemplates.Placeholders)}.");
        RuleFor(x => x.Body)
            .Must(SmsTemplates.HasOptOut)
            .When(x => x.Kind == SmsKinds.RefillReminder && !string.IsNullOrEmpty(x.Body))
            .WithMessage("A refill reminder must tell the customer how to opt out (include the word STOP).");
    }
}

internal static class SmsSettingsMapper
{
    public static SmsSettingsDto ToDto(SmsSettings? settings, IReadOnlyCollection<SmsTemplate> stored)
    {
        var templates = SmsKinds.TemplateKinds
            .SelectMany(kind => SmsLanguages.All.Select(language => new SmsTemplateDto(
                kind,
                language,
                stored.FirstOrDefault(t => t.Kind == kind && t.Language == language)?.Body ?? SmsTemplates.Default(kind, language))))
            .ToList();

        return settings is null
            ? new SmsSettingsDto(
                false, SmsProviderNames.LogOnly, null, false, null, SmsLanguages.English, false,
                false, SmsSettings.DefaultDuesReminderDays, false, SmsSettings.DefaultRefillReminderDays,
                SmsQuietHours.DefaultStart, SmsQuietHours.DefaultEnd, SmsSettings.DefaultMaxPerHour, templates, null)
            : new SmsSettingsDto(
                settings.Enabled,
                settings.Provider,
                settings.SenderId,
                settings.ApiTokenProtected is not null,
                settings.PharmacyName,
                settings.DefaultLanguage,
                settings.ReceiptsEnabled,
                settings.AutoDuesReminders,
                settings.DuesReminderDays,
                settings.AutoRefillReminders,
                settings.RefillReminderDays,
                settings.QuietHoursStart,
                settings.QuietHoursEnd,
                settings.MaxPerHour,
                templates,
                settings.UpdatedAtUtc);
    }
}
