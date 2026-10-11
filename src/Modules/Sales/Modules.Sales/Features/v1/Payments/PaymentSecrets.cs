using FSH.Modules.Sales.Contracts.v1.Payments;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Services;
using Microsoft.AspNetCore.DataProtection;

namespace FSH.Modules.Sales.Features.v1.Payments;

/// <summary>Encrypts the Fonepay password and secret key at rest and maps settings to their DTO.</summary>
public sealed class PaymentSecrets(IDataProtectionProvider dataProtectionProvider)
{
    private const string Purpose = "FSH.Sales.PaymentSettings.v1";
    private readonly IDataProtector _protector = dataProtectionProvider.CreateProtector(Purpose);

    /// <summary>Null for an empty value, so the caller keeps what is stored.</summary>
    public string? ProtectOrKeep(string? plainText) =>
        string.IsNullOrWhiteSpace(plainText) ? null : _protector.Protect(plainText.Trim());

    public FonepayCredentials CredentialsFor(PaymentSettings settings)
    {
        ArgumentNullException.ThrowIfNull(settings);
        return new FonepayCredentials(
            settings.FonepayEnvironment,
            settings.FonepayMerchantCode!,
            settings.FonepayUsername!,
            _protector.Unprotect(settings.FonepayPasswordProtected!),
            _protector.Unprotect(settings.FonepaySecretKeyProtected!));
    }

    public static PaymentSettingsDto ToDto(PaymentSettings? settings) =>
        settings is null
            ? new PaymentSettingsDto(false, null, null, null, null, false, null, null, PaymentSettings.EnvironmentDev, false, false)
            : new PaymentSettingsDto(
                settings.BankQrEnabled,
                settings.BankName,
                settings.AccountName,
                settings.AccountNumber,
                settings.BankQrImage,
                settings.FonepayEnabled,
                settings.FonepayMerchantCode,
                settings.FonepayUsername,
                settings.FonepayEnvironment,
                settings.FonepaySecretKeyProtected is not null,
                settings.FonepayPasswordProtected is not null);
}
