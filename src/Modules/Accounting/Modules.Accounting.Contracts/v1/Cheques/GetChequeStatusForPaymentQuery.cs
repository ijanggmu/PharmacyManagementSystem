using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Cheques;

/// <summary>
/// The register entry (if any) of the cheque that settled a customer receipt / supplier payment — for the owning
/// module's void path, which must not void a payment whose cheque has already cleared (the clearance moved the amount
/// from Cheques in Hand / Cheques Issued to the bank, so a plain payment reversal would leave those accounts wrong).
/// Not exposed over HTTP and not branch-scoped: the caller has already checked the payment's branch.
/// <c>PaymentReferenceType</c> is one of <see cref="ChequePaymentReferenceTypes"/>. Returns <c>null</c> when the payment
/// has no cheque in the register.
/// </summary>
public sealed record GetChequeStatusForPaymentQuery(string PaymentReferenceType, Guid PaymentId) : IQuery<PaymentChequeStatusDto?>;

/// <summary>The payments a cheque can settle — the reference its register entry and GL voucher are posted under.</summary>
public static class ChequePaymentReferenceTypes
{
    public const string CustomerPayment = "CustomerPayment";
    public const string SupplierPayment = "SupplierPayment";
}

/// <summary>A payment's cheque: its number and <see cref="Dtos.ChequeValues"/> status; <c>IsCleared</c> when the bank paid it.</summary>
public sealed record PaymentChequeStatusDto(Guid ChequeId, string ChequeNumber, string Status, bool IsCleared);
