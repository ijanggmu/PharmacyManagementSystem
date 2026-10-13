using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Events;
using FSH.Modules.Suppliers.Contracts.Services;

namespace FSH.Modules.Suppliers.IntegrationEventHandlers;

/// <summary>Credits back the AP ledger for a deleted pay-later expense (reference <c>ExpenseVoid</c> / expense id), the
/// counterpart of Accounting reversing its Cr Accounts Payable. <c>SupplierBillAllocator</c> applies this credit
/// to the expense's own bill first, so the bill closes. Idempotent: <see cref="ISupplierLedgerService.RecordReturnAsync"/>
/// skips a document already credited. Same shape as <see cref="DirectGoodsReceiptVoidedIntegrationEventHandler"/>.</summary>
public sealed class ExpenseBillVoidedIntegrationEventHandler(ISupplierLedgerService supplierLedgerService)
    : IIntegrationEventHandler<ExpenseBillVoidedIntegrationEvent>
{
    public async Task HandleAsync(ExpenseBillVoidedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        if (@event.Amount <= 0)
        {
            return;
        }

        string bill = string.IsNullOrWhiteSpace(@event.BillNumber) ? string.Empty : $" (bill {@event.BillNumber.Trim()})";

        // Dated at the deletion, like the GL reversal: an earlier period's AP balance is never rewritten.
        await supplierLedgerService.RecordReturnAsync(
            @event.SupplierId, @event.Amount, @event.VoidedAtUtc,
            $"Expense bill voided{bill}: {@event.Reason}",
            ExpenseBillReference.VoidReferenceType, @event.ExpenseId, @event.BranchId, ct)
            .ConfigureAwait(false);
    }
}
