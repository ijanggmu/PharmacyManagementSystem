using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Tds;

/// <summary>
/// Records TDS deposited with IRD: posts Dr TDS Payable (2150) / Cr the money account for
/// <paramref name="PaymentMethod"/> as a <c>system_tds_payment</c> voucher (PMT series) dated
/// <paramref name="PaymentDateUtc"/>. A date in a locked period is refused; the amount may not exceed the TDS
/// Payable balance as of the payment date (a 422 says how much is due). Returns the voucher id.
/// </summary>
public sealed record RecordTdsPaymentCommand(
    DateTime PaymentDateUtc,
    decimal Amount,
    string PaymentMethod,
    string? Reference = null,
    string? Narration = null) : ICommand<Guid>;
