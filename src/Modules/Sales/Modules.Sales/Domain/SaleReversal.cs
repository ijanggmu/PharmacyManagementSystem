using System.Net;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Sales.Domain;

/// <summary>VAT carved out of VAT-inclusive amounts (same formula as <see cref="Sale.ApplyVat"/>).</summary>
public sealed record VatBreakdown(decimal RatePercent, decimal TaxableAmount, decimal VatAmount, decimal ExemptAmount)
{
    /// <summary>
    /// Uses the original sale's stored VAT rate. Sales recorded before the breakdown existed have none — their
    /// VAT was still posted to the ledger — so <paramref name="fallbackRatePercent"/> (the tenant's current VAT
    /// rate) is used for them, keeping a return/refund of such a sale reversing its VAT. Null only when neither
    /// rate is known.
    /// </summary>
    public static VatBreakdown? Compute(
        decimal? ratePercent, IEnumerable<(decimal Amount, bool IsTaxable)> lines, decimal? fallbackRatePercent = null)
    {
        ArgumentNullException.ThrowIfNull(lines);
        if ((ratePercent ?? fallbackRatePercent) is not { } rate)
        {
            return null;
        }

        var list = lines.ToList();
        decimal taxableGross = list.Where(l => l.IsTaxable).Sum(l => l.Amount);
        decimal exempt = list.Where(l => !l.IsTaxable).Sum(l => l.Amount);
        decimal vat = rate > 0 ? Money.Round(taxableGross * rate / (100m + rate)) : 0m;
        return new VatBreakdown(rate, taxableGross - vat, vat, exempt);
    }

    /// <summary>The same split with <paramref name="vatAmount"/> as the VAT (kept within the taxable gross): the last
    /// return/refund of a sale takes the VAT the sale has left, so the pieces add up to the sale's VAT exactly.</summary>
    public VatBreakdown WithVat(decimal vatAmount)
    {
        decimal taxableGross = TaxableAmount + VatAmount;
        decimal vat = Math.Clamp(vatAmount, 0m, Math.Max(0m, taxableGross));
        return this with { TaxableAmount = taxableGross - vat, VatAmount = vat };
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

    /// <summary>Every refund method accepted (after <see cref="Normalize"/>): the drawer, the customer's account, the
    /// original payment, or one of the non-cash channels the money can go back through (settled to bank).</summary>
    public static readonly IReadOnlyList<string> All =
        [OriginalPayment, Cash, StoreCredit, SalePaymentMethods.Credit, "card", "bank", "bank_transfer", "fonepay", "esewa", "khalti", "wallet"];

    /// <summary>Blank (= the original payment) or one of <see cref="All"/>; free text such as "bitcoin" is not.</summary>
    public static bool IsKnown(string? refundMethod) => All.Contains(Normalize(refundMethod), StringComparer.Ordinal);

    /// <summary>
    /// Splits <paramref name="amount"/> for <paramref name="sale"/>:
    /// <list type="number">
    /// <item>A sale that was (partly) on account first has its STILL-OPEN balance cancelled: up to
    /// <c>BalanceDue</c> minus what earlier returns/refunds of the same sale already credited
    /// (<paramref name="onAccountAlreadyCredited"/>) goes to the customer's account — the customer is
    /// never handed cash for goods they have not paid for. Customer payments are not allocated to sales, so
    /// what is still open on THIS sale is approximated by also capping at the customer's current receivable
    /// (<paramref name="customerOpenBalance"/>, null = unknown/no cap): a credit sale the customer has since
    /// paid off no longer forces the return onto their account — it follows the refund method instead.</item>
    /// <item>The rest follows <paramref name="refundMethod"/>: cash → drawer; store_credit/credit → the
    /// customer's account (requires a customer); original_payment → split over the sale's cash and
    /// non-cash legs in proportion; any other method (card, bank, wallets) → bank.</item>
    /// </list>
    /// </summary>
    public static SaleReversalSettlement Settle(
        Sale sale, decimal amount, string? refundMethod, decimal onAccountAlreadyCredited, decimal? customerOpenBalance = null)
    {
        ArgumentNullException.ThrowIfNull(sale);
        amount = Money.Round(Math.Max(0m, amount));

        decimal remainingOnAccount = OnAccountCap(sale, onAccountAlreadyCredited, customerOpenBalance);
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

    /// <summary>How much of a return/refund of <paramref name="sale"/> must go to the customer's account to cancel
    /// what is still unpaid on it (see <see cref="Settle"/>).</summary>
    public static decimal OnAccountCap(Sale sale, decimal onAccountAlreadyCredited, decimal? customerOpenBalance)
    {
        ArgumentNullException.ThrowIfNull(sale);
        decimal cap = Math.Max(0m, sale.BalanceDue - onAccountAlreadyCredited);
        if (customerOpenBalance is { } open)
        {
            cap = Math.Min(cap, Math.Max(0m, open));
        }

        return Money.Round(cap);
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
