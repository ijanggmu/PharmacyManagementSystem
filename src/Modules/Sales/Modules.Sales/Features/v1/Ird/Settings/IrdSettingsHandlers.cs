using FluentValidation;
using FSH.Modules.Sales.Contracts.v1.Ird;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Services;
using FSH.Modules.Sales.Services.Ird;
using Mediator;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using IrdSettingsEntity = FSH.Modules.Sales.Domain.IrdSettings;

namespace FSH.Modules.Sales.Features.v1.Ird.Settings;

public sealed class GetIrdSettingsQueryHandler(SalesDbContext dbContext, IOptionsMonitor<IrdOptions> options)
    : IQueryHandler<GetIrdSettingsQuery, IrdSettingsDto>
{
    public async ValueTask<IrdSettingsDto> Handle(GetIrdSettingsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        var settings = await dbContext.IrdSettings.AsNoTracking()
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);
        return IrdSettingsMapper.ToDto(settings, options.CurrentValue);
    }
}

public sealed class UpdateIrdSettingsCommandHandler(SalesDbContext dbContext, IrdSecrets secrets, IOptionsMonitor<IrdOptions> options)
    : ICommandHandler<UpdateIrdSettingsCommand, IrdSettingsDto>
{
    public async ValueTask<IrdSettingsDto> Handle(UpdateIrdSettingsCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var settings = await dbContext.IrdSettings
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);
        if (settings is null)
        {
            settings = IrdSettingsEntity.CreateDefault();
            dbContext.IrdSettings.Add(settings);
        }

        settings.Update(
            command.Enabled,
            command.BaseUrl,
            command.Username,
            secrets.ProtectOrKeep(command.Password),
            command.SellerPan,
            command.AbbreviatedInvoiceThreshold);

        if (settings.Enabled && !settings.IsConfigured)
        {
            throw new ValidationException(
            [
                new FluentValidation.Results.ValidationFailure(
                    nameof(command.Enabled),
                    "IRD e-billing needs the CBMS username, password and the pharmacy's PAN before it can be turned on."),
            ]);
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return IrdSettingsMapper.ToDto(settings, options.CurrentValue);
    }
}

public sealed class UpdateIrdSettingsCommandValidator : AbstractValidator<UpdateIrdSettingsCommand>
{
    public UpdateIrdSettingsCommandValidator()
    {
        RuleFor(x => x.BaseUrl)
            .MaximumLength(300)
            .Must(url => string.IsNullOrWhiteSpace(url)
                || (Uri.TryCreate(url.Trim(), UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp)))
            .WithMessage("The CBMS base URL must be an absolute http(s) URL, e.g. https://cbapi.ird.gov.np.");
        RuleFor(x => x.Username).MaximumLength(128);
        RuleFor(x => x.Password).MaximumLength(256);
        RuleFor(x => x.SellerPan)
            .Must(pan => string.IsNullOrWhiteSpace(pan) || IrdPan.IsValid(pan))
            .WithMessage("The pharmacy's PAN must be 9 digits.");
        RuleFor(x => x.AbbreviatedInvoiceThreshold)
            .GreaterThanOrEqualTo(0m)
            .LessThanOrEqualTo(10_000_000m)
            .PrecisionScale(18, 2, ignoreTrailingZeros: true);
    }
}

internal static class IrdSettingsMapper
{
    public static IrdSettingsDto ToDto(IrdSettingsEntity? settings, IrdOptions options)
    {
        string effective = string.IsNullOrWhiteSpace(settings?.BaseUrl) ? options.DefaultBaseUrl : settings.BaseUrl;
        bool isTest = string.Equals(effective.TrimEnd('/'), IrdOptions.TestBaseUrl, StringComparison.OrdinalIgnoreCase);
        return settings is null
            ? new IrdSettingsDto(false, null, effective, isTest, null, false, null,
                IrdSettingsEntity.DefaultAbbreviatedInvoiceThreshold, options.RealtimeWindowSeconds)
            : new IrdSettingsDto(
                settings.Enabled,
                settings.BaseUrl,
                effective,
                isTest,
                settings.Username,
                settings.PasswordProtected is not null,
                settings.SellerPan,
                settings.AbbreviatedInvoiceThreshold,
                options.RealtimeWindowSeconds);
    }
}
