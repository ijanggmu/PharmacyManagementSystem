using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Vat;

/// <summary>
/// Records a VAT payment to IRD (settling output VAT owed): posts Dr VAT Payable (2100) / Cr Cash or Bank
/// (per <paramref name="PaymentMethod"/>) as a <c>system_vat_payment</c> voucher dated
/// <paramref name="PaymentDateUtc"/>. The VAT return leaves settlement vouchers out, so paying the VAT never
/// shows up as a "refund/adjustment" that lowers the period's output VAT. Returns the voucher id.
/// </summary>
public sealed record RecordVatPaymentCommand(
    DateTime PaymentDateUtc,
    decimal Amount,
    string PaymentMethod,
    string? Reference = null,
    string? Narration = null) : ICommand<Guid>;
