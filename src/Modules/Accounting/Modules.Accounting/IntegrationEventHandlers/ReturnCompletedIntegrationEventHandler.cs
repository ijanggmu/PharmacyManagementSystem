using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Sales.Contracts.Events;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>
/// Posts the GL voucher for a completed customer return — mirrors
/// scripts/80-medicine-returns-accounting.sql's <c>accounting_post_medicine_return_voucher</c>: Dr
/// Sales Returns &amp; Allowances / Cr Cash for the return total, plus Dr Inventory / Cr COGS to
/// reverse cost of goods sold on the returned quantity (using this .NET COA's codes — Inventory=1200,
/// COGS=5000 — rather than the legacy SQL script's 5000/4000, which belonged to a different chart).
/// Idempotent via the posted-voucher unique index on (ReferenceType, ReferenceId).
/// <para>Events that carry the settlement split (<see cref="ReturnCompletedIntegrationEvent.VatAmount"/> set)
/// reverse VAT Payable and credit Cash/Bank/AR per where the money went (<see cref="SaleReversalVoucherLines"/>);
/// older events keep the original Dr 4100 / Cr Cash posting.</para>
/// </summary>
public sealed class ReturnCompletedIntegrationEventHandler(
    IVoucherPostingService voucherPostingService,
    IAccountingAccountResolver accountResolver,
    IPaymentMethodAccountResolver paymentAccounts)
    : IIntegrationEventHandler<ReturnCompletedIntegrationEvent>
{
    public async Task HandleAsync(ReturnCompletedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        if (@event.TotalReturnAmount <= 0)
        {
            return;
        }

        List<PostVoucherLine> lines;
        var settlement = new SaleReversalSettlementAmounts(
            @event.CashAmount, @event.BankAmount, @event.OnAccountAmount, RefundMethod: @event.RefundMethod);
        if (@event.VatAmount is { } vat)
        {
            // A new event (it carries the VAT split): where the money went must add up to the return total,
            // compared at the stored 2-decimal precision. A mismatch is a Sales-side bug — fail loudly (the
            // event retries and then dead-letters, where it is visible) rather than quietly booking the old
            // cash-only entry with VAT Payable and Bank/AR left wrong.
            if (AccountingVoucher.RoundAmount(settlement.Settled) != AccountingVoucher.RoundAmount(@event.TotalReturnAmount))
            {
                throw new InvalidOperationException(
                    $"Return {@event.ReturnId} settlement doesn't add up: cash {@event.CashAmount} + bank {@event.BankAmount} + on account {@event.OnAccountAmount} " +
                    $"should equal the return total {@event.TotalReturnAmount}.");
            }

            lines = await SaleReversalVoucherLines.BuildAsync(
                accountResolver, paymentAccounts, "Sales return / allowance", @event.TotalReturnAmount, vat, settlement, ct).ConfigureAwait(false);
        }
        else
        {
            // Legacy event raised before the settlement split existed: the original Dr 4100 / Cr Cash entry.
            var salesReturnsId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.SalesReturnsAndAllowances, ct).ConfigureAwait(false);
            var cashId = await paymentAccounts.ResolveAccountIdAsync(PaymentMethodAccounts.Cash, ct).ConfigureAwait(false);
            lines =
            [
                new(salesReturnsId, "Sales return / allowance", DebitAmount: @event.TotalReturnAmount, CreditAmount: 0m),
                new(cashId, "Cash / credit issued to customer", DebitAmount: 0m, CreditAmount: @event.TotalReturnAmount),
            ];
        }

        // Only restocked (sealed) packs go back into Inventory; an opened or damaged pack is a loss whose cost
        // stays in COGS.
        decimal cogsReversal = @event.Lines.Where(l => l.Restock).Sum(l => l.Quantity * l.UnitCostPrice);
        if (cogsReversal > 0)
        {
            var inventoryId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Inventory, ct).ConfigureAwait(false);
            var cogsId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.CostOfGoodsSold, ct).ConfigureAwait(false);
            lines.Add(new PostVoucherLine(inventoryId, "Inventory restocked from return", DebitAmount: cogsReversal, CreditAmount: 0m));
            lines.Add(new PostVoucherLine(cogsId, "Reverse COGS", DebitAmount: 0m, CreditAmount: cogsReversal));
        }

        await voucherPostingService.PostSystemVoucherAsync(
            new PostVoucherRequest("system_sales_return", "Return", @event.ReturnId, $"Customer return {@event.CreditNoteNumber ?? @event.ReturnId.ToString()}", lines, BranchId: @event.BranchId, VoucherDateUtc: @event.OccurredOnUtc),
            ct).ConfigureAwait(false);
    }
}
