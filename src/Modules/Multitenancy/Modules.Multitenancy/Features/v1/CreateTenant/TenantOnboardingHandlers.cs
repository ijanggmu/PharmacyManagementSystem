using System.Collections.ObjectModel;
using FluentValidation;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Mailing;
using FSH.Framework.Mailing.Services;
using FSH.Framework.Web.Origin;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Multitenancy.Contracts.v1.CreateTenant;
using FSH.Modules.Multitenancy.Features.v1.SignUpTenant;
using FSH.Modules.Multitenancy.Services;
using Mediator;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FSH.Modules.Multitenancy.Features.v1.CreateTenant;

public sealed class SuggestTenantCodeQueryHandler(ITenantService tenantService)
    : IQueryHandler<SuggestTenantCodeQuery, TenantCodeSuggestionDto>
{
    public async ValueTask<TenantCodeSuggestionDto> Handle(SuggestTenantCodeQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        string name = query.Name?.Trim() ?? string.Empty;
        string code = await TenantSlug.GenerateUniqueAsync(name, tenantService.ExistsWithIdAsync, cancellationToken).ConfigureAwait(false);

        bool nameAvailable = name.Length == 0
            || !await tenantService.ExistsWithNameAsync(name, cancellationToken).ConfigureAwait(false);

        return new TenantCodeSuggestionDto(
            code,
            nameAvailable,
            nameAvailable ? null : "A pharmacy with this name already exists.");
    }
}

/// <summary>Whether outbound email is configured. With nothing set, a send can only fail.</summary>
public static class MailAvailability
{
    public static bool IsConfigured(MailOptions? options)
    {
        if (options is null)
        {
            return false;
        }

        if (options.UseSendGrid)
        {
            return !string.IsNullOrWhiteSpace(options.SendGrid?.ApiKey);
        }

        return !string.IsNullOrWhiteSpace(options.Smtp?.Host) && !string.IsNullOrWhiteSpace(options.From);
    }
}

public sealed class GetTenantOnboardingOptionsQueryHandler(IOptions<MailOptions> mailOptions)
    : IQueryHandler<GetTenantOnboardingOptionsQuery, TenantOnboardingOptionsDto>
{
    public ValueTask<TenantOnboardingOptionsDto> Handle(GetTenantOnboardingOptionsQuery query, CancellationToken cancellationToken) =>
        ValueTask.FromResult(new TenantOnboardingOptionsDto(MailAvailability.IsConfigured(mailOptions.Value)));
}

public sealed class SendTenantWelcomeEmailCommandValidator : AbstractValidator<SendTenantWelcomeEmailCommand>
{
    public SendTenantWelcomeEmailCommandValidator()
    {
        RuleFor(x => x.TenantId).NotEmpty();
        RuleFor(x => x.AdminPassword).Cascade(CascadeMode.Stop)
            .NotEmpty().WithMessage("The admin password is required to send the welcome email.")
            .MinimumLength(SignUpTenantCommandValidator.MinPasswordLength)
            .MaximumLength(128);
    }
}

public sealed partial class SendTenantWelcomeEmailCommandHandler(
    ITenantService tenantService,
    IMailService mailService,
    IOptions<MailOptions> mailOptions,
    IOptions<OriginOptions> originOptions,
    ILogger<SendTenantWelcomeEmailCommandHandler> logger)
    : ICommandHandler<SendTenantWelcomeEmailCommand, Unit>
{
    public async ValueTask<Unit> Handle(SendTenantWelcomeEmailCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        if (!MailAvailability.IsConfigured(mailOptions.Value))
        {
            throw new CustomException(
                "Email isn't set up on this server yet. Download the PDF or copy the details instead.",
                errors: null,
                System.Net.HttpStatusCode.Conflict);
        }

        var tenant = await tenantService.GetStatusAsync(command.TenantId, cancellationToken).ConfigureAwait(false);
        string tenantId = tenant.Id;
        if (string.IsNullOrWhiteSpace(tenant.AdminEmail))
        {
            throw new CustomException("This tenant has no admin email on record.", errors: null, System.Net.HttpStatusCode.BadRequest);
        }

        // Links come from configuration, never the request's Host header.
        string? origin = originOptions.Value.OriginUrl?.ToString().TrimEnd('/');
        if (string.IsNullOrWhiteSpace(origin))
        {
            throw new CustomException("The web app address is not configured (OriginOptions:OriginUrl).", errors: null, System.Net.HttpStatusCode.InternalServerError);
        }

        var (subject, body) = TenantWelcomeEmail.Build(new TenantWelcomeEmail.Details(
            PharmacyName: tenant.Name,
            TenantCode: tenant.Id,
            SignInUrl: $"{origin}/t/{Uri.EscapeDataString(tenant.Id)}/login",
            AdminEmail: tenant.AdminEmail,
            AdminPassword: command.AdminPassword,
            Plan: tenant.Plan,
            ValidUpto: tenant.ValidUpto));

        try
        {
            await mailService.SendAsync(
                new MailRequest(new Collection<string> { tenant.AdminEmail }, subject, body),
                cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Never log the recipient or the body (it holds a password).
            LogSendFailed(logger, ex, tenantId);
            throw new CustomException(
                "The welcome email could not be sent. Check the email settings, or download the PDF instead.",
                errors: null,
                System.Net.HttpStatusCode.BadGateway);
        }

        LogSent(logger, tenantId);
        return Unit.Value;
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Failed to send the welcome email for tenant {TenantId}")]
    private static partial void LogSendFailed(ILogger logger, Exception exception, string tenantId);

    [LoggerMessage(Level = LogLevel.Information, Message = "Sent the welcome email for tenant {TenantId}")]
    private static partial void LogSent(ILogger logger, string tenantId);
}
