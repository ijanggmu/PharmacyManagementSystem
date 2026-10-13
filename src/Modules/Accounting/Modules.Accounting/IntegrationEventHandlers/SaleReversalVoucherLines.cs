using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Services;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>
/// The revenue/VAT/settlement part of a sale-reversal voucher (customer return or refund), mirroring how
/// <see cref="SaleCompletedIntegrationEventHandler"/> posted the sale:
/// <list type="bullet">
/// <item>Dr Sales Returns &amp; Allowances (4100) for the reversed value net of VAT;</item>
/// <item>Dr VAT Payable (2100) for the VAT inside it — the output VAT the sale credited is reversed;</item>
/// <item>Cr the cash / bank money accounts (the tenant's mapping for "cash", and for the refund method when it
/// names a non-cash method — card, eSewa … — else for "bank"; Cash 1000 / Bank 1010 by default) / Accounts
/// Receivable (1100) for where the money went back (drawer, card/bank/wallet, or the customer's account — a
/// credit sale's unpaid balance or store credit);</item>
/// <item>Cr Sales Revenue (4000) for any processing fee kept on a refund.</item>
/// </list>
/// Debits = <c>gross</c>; credits = settlement + fee = gross, so the voucher balances.
/// </summary>
internal static class SaleReversalVoucherLines
{
    public static async Task<List<PostVoucherLine>> BuildAsync(
        IAccountingAccountResolver accountResolver,
        IPaymentMethodAccountResolver paymentAccounts,
        string label,
        decimal gross,
        decimal vat,
        SaleReversalSettlementAmounts settlement,
        CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(accountResolver);
        ArgumentNullException.ThrowIfNull(paymentAccounts);
        ArgumentNullException.ThrowIfNull(settlement);

        decimal vatReversed = Math.Clamp(vat, 0m, gross);
        var lines = new List<PostVoucherLine>();

        var salesReturnsId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.SalesReturnsAndAllowances, ct).ConfigureAwait(false);
        lines.Add(new PostVoucherLine(salesReturnsId, label, DebitAmount: gross - vatReversed, CreditAmount: 0m));

        if (vatReversed > 0m)
        {
            var vatPayableId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.VatPayable, ct).ConfigureAwait(false);
            lines.Add(new PostVoucherLine(vatPayableId, "Output VAT reversed", DebitAmount: vatReversed, CreditAmount: 0m));
        }

        if (settlement.Cash > 0m)
        {
            var cashId = await paymentAccounts.ResolveAccountIdAsync(PaymentMethodAccounts.Cash, ct).ConfigureAwait(false);
            lines.Add(new PostVoucherLine(cashId, "Cash paid back to customer", DebitAmount: 0m, CreditAmount: settlement.Cash));
        }

        if (settlement.Bank > 0m)
        {
            var bankId = await paymentAccounts.ResolveAccountIdAsync(BankMethod(settlement.RefundMethod), ct).ConfigureAwait(false);
            lines.Add(new PostVoucherLine(bankId, "Paid back to card/bank/wallet", DebitAmount: 0m, CreditAmount: settlement.Bank));
        }

        if (settlement.OnAccount > 0m)
        {
            var arId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.AccountsReceivable, ct).ConfigureAwait(false);
            lines.Add(new PostVoucherLine(arId, "Credited to customer account", DebitAmount: 0m, CreditAmount: settlement.OnAccount));
        }

        if (settlement.FeeRetained > 0m)
        {
            var revenueId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.SalesRevenue, ct).ConfigureAwait(false);
            lines.Add(new PostVoucherLine(revenueId, "Refund processing fee", DebitAmount: 0m, CreditAmount: settlement.FeeRetained));
        }

        return lines;
    }

    /// <summary>The method whose account takes the non-cash part: the refund method itself when it names a
    /// known non-cash method (card, eSewa, cheque …); otherwise — original payment (possibly several legs),
    /// blank, or anything unknown — "bank", which is where it always went.</summary>
    internal static string BankMethod(string? refundMethod)
    {
        if (PaymentMethodAccounts.IsCash(refundMethod) || !PaymentMethodAccounts.IsKnown(refundMethod))
        {
            return PaymentMethodAccounts.Bank;
        }

        return PaymentMethodAccounts.Normalize(refundMethod);
    }
}

/// <summary>Where a reversal's money went back, plus any fee the pharmacy kept, and the refund method the
/// customer chose (picks the account for the non-cash part).</summary>
internal sealed record SaleReversalSettlementAmounts(
    decimal Cash, decimal Bank, decimal OnAccount, decimal FeeRetained = 0m, string? RefundMethod = null)
{
    public decimal Settled => Cash + Bank + OnAccount;
}
