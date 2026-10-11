using FSH.Framework.Core.Domain;

namespace FSH.Modules.Sales.Domain;

/// <summary>
/// One row per tenant: the static bank QR shown at checkout and the Fonepay merchant credentials used to
/// request dynamic QRs. The Fonepay password and secret key are stored already encrypted (Data Protection);
/// this entity never sees them in plain text.
/// </summary>
public sealed class PaymentSettings : AggregateRoot<Guid>
{
    public const string EnvironmentDev = "dev";
    public const string EnvironmentLive = "live";

    public bool BankQrEnabled { get; private set; }
    public string? BankName { get; private set; }
    public string? AccountName { get; private set; }
    public string? AccountNumber { get; private set; }

    /// <summary>The uploaded QR as a data URL (data:image/png;base64,…).</summary>
    public string? BankQrImage { get; private set; }

    public bool FonepayEnabled { get; private set; }
    public string? FonepayMerchantCode { get; private set; }
    public string? FonepayUsername { get; private set; }
    public string FonepayEnvironment { get; private set; } = EnvironmentDev;
    public string? FonepayPasswordProtected { get; private set; }
    public string? FonepaySecretKeyProtected { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    private PaymentSettings() { }

    public static PaymentSettings CreateDefault() => new()
    {
        Id = Guid.CreateVersion7(),
        UpdatedAtUtc = DateTime.UtcNow,
    };

    public void UpdateBankQr(bool enabled, string? bankName, string? accountName, string? accountNumber, string? qrImage)
    {
        BankQrEnabled = enabled;
        BankName = Normalize(bankName);
        AccountName = Normalize(accountName);
        AccountNumber = Normalize(accountNumber);
        BankQrImage = Normalize(qrImage);
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>A null protected password or secret keeps the stored one.</summary>
    public void UpdateFonepay(
        bool enabled, string? merchantCode, string? username, string environment,
        string? passwordProtected, string? secretKeyProtected)
    {
        FonepayEnabled = enabled;
        FonepayMerchantCode = Normalize(merchantCode);
        FonepayUsername = Normalize(username);
        FonepayEnvironment = environment;
        if (passwordProtected is not null)
        {
            FonepayPasswordProtected = passwordProtected;
        }

        if (secretKeyProtected is not null)
        {
            FonepaySecretKeyProtected = secretKeyProtected;
        }

        UpdatedAtUtc = DateTime.UtcNow;
    }

    public bool IsFonepayConfigured =>
        FonepayEnabled
        && !string.IsNullOrWhiteSpace(FonepayMerchantCode)
        && !string.IsNullOrWhiteSpace(FonepayUsername)
        && FonepayPasswordProtected is not null
        && FonepaySecretKeyProtected is not null;

    private static string? Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
