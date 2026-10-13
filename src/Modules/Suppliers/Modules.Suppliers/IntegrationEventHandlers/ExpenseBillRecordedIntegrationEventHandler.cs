using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Events;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Services;

namespace FSH.Modules.Suppliers.IntegrationEventHandlers;

/// <summary>
/// Adds a pay-later expense's bill to the supplier's AP ledger (a debit, reference <c>Expense</c> / expense id),
/// matching the Cr Accounts Payable Accounting already posted, so AP control and supplier balances stay reconciled.
/// The bill is then settled through the normal supplier payment flow (it appears in the supplier's open bills).
/// Mirrors <see cref="DirectGoodsReceiptPostedIntegrationEventHandler"/>: the supplier row is locked
/// (<see cref="SupplierRowLock"/>) before the balance is read and moved, and an expense already on the ledger is
/// skipped (<see cref="SupplierLedgerIdempotency"/>), so a redelivered event never posts the bill twice.
/// </summary>
public sealed class ExpenseBillRecordedIntegrationEventHandler(SuppliersDbContext dbContext, ICurrentBranch currentBranch)
    : IIntegrationEventHandler<ExpenseBillRecordedIntegrationEvent>
{
    public async Task HandleAsync(ExpenseBillRecordedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        if (@event.Amount <= 0)
        {
            return;
        }

        Guid? branchId = @event.BranchId ?? await currentBranch.GetBranchIdAsync(ct).ConfigureAwait(false);

        await SupplierRowLock.InTransactionAsync(dbContext, async () =>
        {
            var supplier = await SupplierRowLock.LockAsync(dbContext, @event.SupplierId, ct, includeDeleted: true).ConfigureAwait(false);

            if (await SupplierLedgerIdempotency.IsPostedAsync(
                    dbContext, @event.SupplierId, SupplierLedgerEntryType.Purchase, ExpenseBillReference.ReferenceType, @event.ExpenseId, ct)
                .ConfigureAwait(false))
            {
                return false;
            }

            // A bill owed increases what the pharmacy owes: debit side of the AP ledger.
            decimal newBalance = supplier.ApplyLedgerEntry(debitAmount: @event.Amount, creditAmount: 0m);
            dbContext.SupplierLedgerEntries.Add(SupplierLedgerEntry.Create(
                supplier.Id, @event.ExpenseDateUtc, SupplierLedgerEntryType.Purchase,
                Describe(@event), debitAmount: @event.Amount, creditAmount: 0m, runningBalance: newBalance,
                referenceType: ExpenseBillReference.ReferenceType, referenceId: @event.ExpenseId, branchId: branchId,
                supplierBillNumber: @event.BillNumber, tdsAmount: Math.Max(0m, @event.TdsAmount),
                dueDateUtc: supplier.DueDateFor(@event.ExpenseDateUtc, @event.DueDateUtc)));

            await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);
            return true;
        }, ct).ConfigureAwait(false);
    }

    /// <summary>"Expense: Utilities (bill NEA-17) — Electricity", capped at the ledger description column (512).</summary>
    internal static string Describe(ExpenseBillRecordedIntegrationEvent @event)
    {
        string text = "Expense: " + @event.Category;
        if (!string.IsNullOrWhiteSpace(@event.BillNumber))
        {
            text += " (bill " + @event.BillNumber.Trim() + ")";
        }

        if (!string.IsNullOrWhiteSpace(@event.Description))
        {
            text += " — " + @event.Description.Trim();
        }

        return text.Length <= 512 ? text : text[..512];
    }
}
