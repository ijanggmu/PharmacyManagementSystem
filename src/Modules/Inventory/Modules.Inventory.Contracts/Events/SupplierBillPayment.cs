namespace FSH.Modules.Inventory.Contracts.Events;

/// <summary>
/// "Paid at entry" for a supplier bill: the bill was paid (fully or partly) when the stock was entered, so the
/// payment is recorded against that bill straight away. <see cref="Amount"/> null means the full bill total.
/// <see cref="PaymentDateUtc"/> null means the bill date. Carried from the medicine / receipt entry through
/// Purchasing to Suppliers, which records it and raises the payment voucher event.
/// </summary>
public sealed record SupplierBillPayment(
    string Method,
    decimal? Amount = null,
    string? Reference = null,
    DateTime? PaymentDateUtc = null);

/// <summary>Payment methods accepted for a supplier payment (mirrors the web app's PARTY_PAYMENT_METHODS).
/// Accounting books "cash" to Cash and every other method to Bank.</summary>
public static class SupplierPaymentMethods
{
    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "cash", "bank", "cheque", "card", "esewa", "khalti", "fonepay",
    };

    public static bool IsKnown(string? method) => method is not null && All.Contains(method.Trim());
}
