using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Sales.Contracts.Events;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>Posts the GL voucher for a completed refund: Cr Cash / Cr Bank for the amount paid out (split as
/// the refund recorded it — cash from the drawer, card/wallet/bank back through the bank) and Cr Accounts
/// Receivable for the part credited to the customer's account (owed on a credit sale, or store credit), Dr VAT
/// Payable for the VAT inside it (prices include VAT, so the sale's VAT is reversed out), and Dr Sales
/// Returns &amp; Allowances for the rest. Refunds raised before the event carried VAT post the whole
/// amount to Sales Returns. Purely financial — unlike
/// <see cref="ReturnCompletedIntegrationEventHandler"/> there is no COGS/Inventory reversal, since a
/// refund never restocks (see <c>SaleRefund</c>'s own doc comment). Idempotent via the posted-voucher
/// unique index on (ReferenceType, ReferenceId).</summary>
public sealed class RefundCompletedIntegrationEventHandler(
    IVoucherPostingService voucherPostingService,
    IAccountingAccountResolver accountResolver)
    : IIntegrationEventHandler<RefundCompletedIntegrationEvent>
{
    public async Task HandleAsync(RefundCompletedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        if (@event.NetRefundAmount <= 0)
        {
            return;
        }

        var salesReturnsId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.SalesReturnsAndAllowances, ct).ConfigureAwait(false);
        var cashId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Cash, ct).ConfigureAwait(false);

        // A processing fee can make the net smaller than the refunded VAT; VAT never exceeds the net.
        decimal vat = Math.Min(Math.Max(@event.VatAmount, 0m), @event.NetRefundAmount);
        // Money owed on a credit sale (or a store-credit refund) comes off the customer's account instead of the till.
        decimal toAccount = Math.Min(Math.Max(@event.AccountCreditAmount, 0m), @event.NetRefundAmount);
        decimal paidOut = @event.NetRefundAmount - toAccount;
        // A refund back to a card / Fonepay / bank payment leaves the bank, not the drawer. Refunds raised before
        // the split was recorded carry neither amount and pay out in cash, as they always did.
        bool hasSplit = @event.CashPaidOut + @event.BankPaidOut > 0;
        decimal bankOut = hasSplit ? Math.Min(@event.BankPaidOut, paidOut) : 0m;
        decimal cashOut = paidOut - bankOut;
        var lines = new List<PostVoucherLine>();
        if (cashOut > 0)
        {
            lines.Add(new PostVoucherLine(cashId, "Cash refunded to customer", DebitAmount: 0m, CreditAmount: cashOut));
        }

        if (bankOut > 0)
        {
            var bankId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Bank, ct).ConfigureAwait(false);
            lines.Add(new PostVoucherLine(bankId, "Refunded to the original card / wallet / bank payment", DebitAmount: 0m, CreditAmount: bankOut));
        }

        if (toAccount > 0)
        {
            var receivableId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.AccountsReceivable, ct).ConfigureAwait(false);
            lines.Add(new PostVoucherLine(receivableId, "Credited to customer account", DebitAmount: 0m, CreditAmount: toAccount));
        }

        if (@event.NetRefundAmount - vat > 0)
        {
            lines.Add(new PostVoucherLine(salesReturnsId, "Sales refund", DebitAmount: @event.NetRefundAmount - vat, CreditAmount: 0m));
        }

        if (vat > 0)
        {
            var vatPayableId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.VatPayable, ct).ConfigureAwait(false);
            lines.Add(new PostVoucherLine(vatPayableId, "VAT reversed on refund", DebitAmount: vat, CreditAmount: 0m));
        }

        await voucherPostingService.PostSystemVoucherAsync(
            new PostVoucherRequest("system_refund", "Refund", @event.RefundId, $"Refund {@event.RefundId}", lines, BranchId: @event.BranchId),
            ct).ConfigureAwait(false);
    }
}
