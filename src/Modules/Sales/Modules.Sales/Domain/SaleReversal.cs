using System.Net;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Sales.Domain;

/// <summary>VAT carved out of VAT-inclusive amounts (same formula as <see cref="Sale.ApplyVat"/>).</summary>
public sealed record VatBreakdown(decimal RatePercent, decimal TaxableAmount, decimal VatAmount, decimal ExemptAmount)
{
    /// <summary>Null when the original sale has no stored VAT rate (sales recorded before the breakdown existed).</summary>
    public static VatBreakdown? Compute(decimal? ratePercent, IEnumerable<(decimal Amount, bool IsTaxable)> lines)
    {
        ArgumentNullException.ThrowIfNull(lines);
        if (ratePercent is not { } rate)
        {
            return null;
        }

        var list = lines.ToList();
        decimal taxableGross = list.Where(l => l.IsTaxable).Sum(l => l.Amount);
        decimal exempt = list.Where(l => !l.IsTaxable).Sum(l => l.Amount);
        decimal vat = rate > 0 ? Money.Round(taxableGross * rate / (100m + rate)) : 0m;
        return new VatBreakdown(rate, taxableGross - vat, vat, exempt);
    }
}

/// <summary>
/// How the money of a completed return/refund goes back to the customer, split by where it leaves the
/// books: <see cref="Cash"/> (out of the drawer), <see cref="Bank"/> (card/wallet/bank transfer) and
/// <see cref="OnAccount"/> (credited to the customer's receivable — cancels what a credit sale still owes,
/// or store credit). The three always add up to the amount settled.
/// </summary>
public sealed record SaleReversalSettlement(decimal Cash, decimal Bank, decimal OnAccount)
{
    public decimal Total => Cash + Bank + OnAccount;
}

/// <summary>Refund methods accepted on returns and refunds, and the settlement rule.</summary>
public static class RefundMethods
{
    public const string OriginalPayment = "original_payment";
    public const string Cash = "cash";
    public const string StoreCredit = "store_credit";

    /// <summary>
    /// Splits <paramref name="amount"/> for <paramref name="sale"/>:
    /// <list type="number">
    /// <item>A sale that was (partly) on account first has its own unpaid balance cancelled: up to
    /// <c>BalanceDue</c> minus what earlier returns/refunds of the same sale already credited
    /// (<paramref name="onAccountAlreadyCredited"/>) goes to the customer's account — the customer is
    /// never handed cash for goods they have not paid for.</item>
    /// <item>The rest follows <paramref name="refundMethod"/>: cash → drawer; store_credit/credit → the
    /// customer's account (requires a customer); original_payment → split over the sale's cash and
    /// non-cash legs in proportion; any other method (card, bank, wallets) → bank.</item>
    /// </list>
    /// </summary>
    public static SaleReversalSettlement Settle(Sale sale, decimal amount, string? refundMethod, decimal onAccountAlreadyCredited)
    {
        ArgumentNullException.ThrowIfNull(sale);
        amount = Money.Round(Math.Max(0m, amount));

        decimal remainingOnAccount = Math.Max(0m, sale.BalanceDue - onAccountAlreadyCredited);
        decimal onAccount = Math.Min(amount, remainingOnAccount);
        decimal rest = amount - onAccount;

        string method = Normalize(refundMethod);
        if (rest == 0m)
        {
            return new SaleReversalSettlement(0m, 0m, onAccount);
        }

        if (method is StoreCredit or SalePaymentMethods.Credit)
        {
            if (sale.CustomerId is null)
            {
                throw new CustomException(
                    "Store credit needs a customer — this sale was a walk-in sale. Refund in cash or to the original payment instead.",
                    (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
            }

            return new SaleReversalSettlement(0m, 0m, onAccount + rest);
        }

        if (method == Cash)
        {
            return new SaleReversalSettlement(rest, 0m, onAccount);
        }

        if (method == OriginalPayment)
        {
            decimal cashReceived = sale.Payments
                .Where(p => string.Equals(p.Method, SalePaymentMethods.Cash, StringComparison.OrdinalIgnoreCase))
                .Sum(p => p.Amount);
            decimal received = sale.PaymentAmount;
            decimal cash = received <= 0m
                ? rest
                : Money.Round(rest * Math.Min(1m, cashReceived / received));
            return new SaleReversalSettlement(cash, rest - cash, onAccount);
        }

        return new SaleReversalSettlement(0m, rest, onAccount);
    }

    /// <summary>Lower-case, trimmed; blank means the original payment method.</summary>
    public static string Normalize(string? refundMethod)
    {
        if (string.IsNullOrWhiteSpace(refundMethod))
        {
            return OriginalPayment;
        }

        string trimmed = refundMethod.Trim();
#pragma warning disable CA1308 // Method names are stored lower-case, matching the legacy values.
        string lower = trimmed.ToLowerInvariant();
#pragma warning restore CA1308
        return lower == "original" ? OriginalPayment : lower;
    }
}
