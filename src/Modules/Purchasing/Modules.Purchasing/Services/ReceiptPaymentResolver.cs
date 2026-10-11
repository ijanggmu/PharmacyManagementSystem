using FSH.Modules.Purchasing.Contracts.Events;

namespace FSH.Modules.Purchasing.Services;

/// <summary>Turns a "paid at entry" request into the payment the posted-receipt event carries: the amount
/// defaults to the receipt total and is capped at it (lines skipped as zero-value can make the total smaller
/// than what was entered); the date defaults to the receipt date.</summary>
internal static class ReceiptPaymentResolver
{
    public static DirectGoodsReceiptPayment? Resolve(
        string? method, decimal? amount, string? reference, DateTime? paymentDateUtc, decimal grossAmount, DateTime receiptDateUtc)
    {
        if (string.IsNullOrWhiteSpace(method) || grossAmount <= 0)
        {
            return null;
        }

        decimal paid = Math.Min(amount ?? grossAmount, grossAmount);
        if (paid <= 0)
        {
            return null;
        }

        return new DirectGoodsReceiptPayment(
            // Methods are lower-case codes ("cash", "esewa"); Accounting matches them case-insensitively.
            method.Trim(),
            paid,
            paymentDateUtc ?? receiptDateUtc,
            string.IsNullOrWhiteSpace(reference) ? null : reference.Trim());
    }
}
