using FluentValidation;
using FSH.Modules.Sales.Contracts.v1.Payments;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Payments;

public sealed class GetPaymentSettingsQueryHandler(SalesDbContext dbContext)
    : IQueryHandler<GetPaymentSettingsQuery, PaymentSettingsDto>
{
    public async ValueTask<PaymentSettingsDto> Handle(GetPaymentSettingsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        var settings = await dbContext.PaymentSettings.AsNoTracking()
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);
        return PaymentSecrets.ToDto(settings);
    }
}

public sealed class UpdatePaymentSettingsCommandHandler(SalesDbContext dbContext, PaymentSecrets secrets)
    : ICommandHandler<UpdatePaymentSettingsCommand, PaymentSettingsDto>
{
    public async ValueTask<PaymentSettingsDto> Handle(UpdatePaymentSettingsCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var settings = await dbContext.PaymentSettings
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);
        if (settings is null)
        {
            settings = PaymentSettings.CreateDefault();
            dbContext.PaymentSettings.Add(settings);
        }

        settings.UpdateBankQr(command.BankQrEnabled, command.BankName, command.AccountName, command.AccountNumber, command.BankQrImage);
        settings.UpdateFonepay(
            command.FonepayEnabled,
            command.FonepayMerchantCode,
            command.FonepayUsername,
            PaymentSettingsRules.NormalizeEnvironment(command.FonepayEnvironment),
            secrets.ProtectOrKeep(command.FonepayPassword),
            secrets.ProtectOrKeep(command.FonepaySecretKey));

        if (settings.FonepayEnabled && !settings.IsFonepayConfigured)
        {
            throw new ValidationException(
            [
                new FluentValidation.Results.ValidationFailure(
                    nameof(command.FonepayEnabled),
                    "Fonepay needs a merchant code, API username, password and secret key before it can be enabled."),
            ]);
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return PaymentSecrets.ToDto(settings);
    }
}

public sealed class UpdatePaymentSettingsCommandValidator : AbstractValidator<UpdatePaymentSettingsCommand>
{
    public UpdatePaymentSettingsCommandValidator()
    {
        RuleFor(x => x.BankName).MaximumLength(150);
        RuleFor(x => x.AccountName).MaximumLength(150);
        RuleFor(x => x.AccountNumber).MaximumLength(64);
        RuleFor(x => x.FonepayMerchantCode).MaximumLength(64);
        RuleFor(x => x.FonepayUsername).MaximumLength(128);
        RuleFor(x => x.FonepayPassword).MaximumLength(256);
        RuleFor(x => x.FonepaySecretKey).MaximumLength(512);

        RuleFor(x => x.FonepayEnvironment)
            .Must(env => env is null || PaymentSettingsRules.IsKnownEnvironment(env))
            .WithMessage("Fonepay environment must be 'dev' or 'live'.");

        RuleFor(x => x.BankQrImage)
            .Must(PaymentSettingsRules.IsAcceptedQrImage)
            .WithMessage("The QR image must be a PNG, JPEG or WebP data URL of at most 700 KB.");

        RuleFor(x => x.BankQrImage)
            .NotEmpty()
            .When(x => x.BankQrEnabled)
            .WithMessage("Upload the bank QR image before enabling the static QR.");
    }
}

public static class PaymentSettingsRules
{
    /// <summary>Data-URL length cap (~700 KB of base64 text).</summary>
    public const int MaxQrImageLength = 700_000;

    private static readonly string[] AcceptedImagePrefixes =
    [
        "data:image/png;base64,",
        "data:image/jpeg;base64,",
        "data:image/webp;base64,",
    ];

    public static bool IsKnownEnvironment(string environment) =>
        string.Equals(environment, PaymentSettings.EnvironmentDev, StringComparison.OrdinalIgnoreCase)
        || string.Equals(environment, PaymentSettings.EnvironmentLive, StringComparison.OrdinalIgnoreCase);

    public static string NormalizeEnvironment(string? environment) =>
        string.Equals(environment, PaymentSettings.EnvironmentLive, StringComparison.OrdinalIgnoreCase)
            ? PaymentSettings.EnvironmentLive
            : PaymentSettings.EnvironmentDev;

    public static bool IsAcceptedQrImage(string? image) =>
        string.IsNullOrWhiteSpace(image)
        || (image.Length <= MaxQrImageLength
            && AcceptedImagePrefixes.Any(prefix => image.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)));
}
