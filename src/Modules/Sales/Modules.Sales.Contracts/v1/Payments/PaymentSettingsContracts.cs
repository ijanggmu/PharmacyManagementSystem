using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Payments;

/// <summary>
/// The tenant's POS payment settings: a static bank QR (an uploaded image plus account details) and the
/// Fonepay merchant credentials for dynamic QR. The Fonepay password and secret key are write-only: they are
/// stored encrypted and only reported back as <see cref="FonepayHasPassword"/> / <see cref="FonepayHasSecret"/>.
/// </summary>
public sealed record PaymentSettingsDto(
    bool BankQrEnabled,
    string? BankName,
    string? AccountName,
    string? AccountNumber,
    string? BankQrImage,
    bool FonepayEnabled,
    string? FonepayMerchantCode,
    string? FonepayUsername,
    string FonepayEnvironment,
    bool FonepayHasSecret,
    bool FonepayHasPassword);

/// <summary>Readable by anyone who can view sales, so the POS can show the QR.</summary>
public sealed record GetPaymentSettingsQuery : IQuery<PaymentSettingsDto>;

/// <summary>
/// Full replace of the payment settings. A null or empty <see cref="FonepaySecretKey"/> /
/// <see cref="FonepayPassword"/> keeps the stored value.
/// </summary>
public sealed record UpdatePaymentSettingsCommand(
    bool BankQrEnabled,
    string? BankName,
    string? AccountName,
    string? AccountNumber,
    string? BankQrImage,
    bool FonepayEnabled,
    string? FonepayMerchantCode,
    string? FonepayUsername,
    string? FonepayEnvironment,
    string? FonepaySecretKey,
    string? FonepayPassword) : ICommand<PaymentSettingsDto>;

/// <summary>Asks Fonepay for a dynamic QR for <paramref name="Amount"/>. The response carries the PRN to poll.</summary>
public sealed record CreateFonepayQrCommand(decimal Amount, string? Remarks1 = null, string? Remarks2 = null)
    : ICommand<FonepayQrDto>;

/// <param name="Prn">Product reference number: our unique id for this QR, used to poll its status.</param>
/// <param name="QrMessage">The string to encode as the QR image.</param>
/// <param name="Amount">The amount the QR charges, rounded to paisa.</param>
/// <param name="WebSocketUrl">Fonepay's real-time status socket, when it returns one.</param>
/// <param name="CreatedAtUtc">When the QR was issued.</param>
public sealed record FonepayQrDto(string Prn, string QrMessage, decimal Amount, string? WebSocketUrl, DateTime CreatedAtUtc);

public sealed record GetFonepayQrStatusQuery(string Prn) : IQuery<FonepayQrStatusDto>;

/// <param name="Prn">The QR's product reference number.</param>
/// <param name="Status">"pending", "success" or "failed".</param>
/// <param name="Message">Gateway message, e.g. why the check failed.</param>
/// <param name="TraceId">Fonepay's trace id once paid; store it as the payment reference.</param>
public sealed record FonepayQrStatusDto(string Prn, string Status, string? Message, string? TraceId);
