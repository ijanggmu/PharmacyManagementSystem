using System.Diagnostics;
using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Suppliers.Contracts.Events;
using FSH.Modules.Suppliers.Contracts.v1.Returns;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Features.v1.Returns.CreateSupplierReturn;

/// <summary>
/// Ports <c>createSupplierReturnForTenant</c> (lib/server/services/supplier-return-service.ts):
///
/// 1. R5 (domain audit) — a line cannot return more than was ever actually received from this
///    supplier for that medicine, minus what's already been returned. Only enforced when receipt
///    history exists (received &gt; 0 via Purchasing's <see cref="GetSupplierReceivedQuantityQuery"/>)
///    — stock predating receipt-tracking (e.g. an opening-balance import) must not be wrongly
///    blocked, same reasoning as the source.
/// 2. Stock must actually be on hand — deducted synchronously via Inventory's
///    <see cref="IStockDeductionService"/> BEFORE this aggregate is committed, mirroring
///    <c>ReceivePurchaseOrderCommandHandler</c>'s "a failed receipt must never be committed" shape
///    (the .NET equivalent of the source's own branch-stock-availability check).
/// 3. The AP subledger is credited locally, synchronously, in the same transaction as the return
///    itself (mirrors <c>trg_supplier_returns_accounting</c> crediting the per-supplier subledger to
///    match the GL control account).
/// 4. The offsetting GL voucher (Accounting) is posted asynchronously off
///    <see cref="SupplierReturnCreatedIntegrationEvent"/> via the Outbox — same shape as
///    <c>RecordSupplierPaymentCommandHandler</c>.
///
/// Concurrency note: like <c>IStockDeductionService</c> itself, the "already returned" sum below is
/// a plain tracked read, not <c>SELECT ... FOR UPDATE</c> — a tracked follow-up, not re-implemented
/// here (same caveat as <c>CreateReturnCommandHandler</c> in Sales).
/// </summary>
public sealed class CreateSupplierReturnCommandHandler(
    SuppliersDbContext dbContext,
    IStockDeductionService stockDeductionService,
    IMediator mediator,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch) : ICommandHandler<CreateSupplierReturnCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreateSupplierReturnCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var supplier = await dbContext.Suppliers
            .FirstOrDefaultAsync(s => s.Id == command.SupplierId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Supplier {command.SupplierId} not found.");

        Guid? branchId = await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);

        var supplierReturn = SupplierReturn.Create(supplier.Id, command.ReturnDateUtc, command.Notes, branchId);

        foreach (var input in command.Items)
        {
            decimal received = await mediator.Send(
                new GetSupplierReceivedQuantityQuery(supplier.Id, input.MedicineId), cancellationToken)
                .ConfigureAwait(false);

            if (received > 0)
            {
                decimal alreadyReturned = await (
                    from item in dbContext.SupplierReturnItems
                    join ret in dbContext.SupplierReturns on item.SupplierReturnId equals ret.Id
                    where ret.SupplierId == supplier.Id && item.MedicineId == input.MedicineId
                    select item.Quantity)
                    .SumAsync(cancellationToken)
                    .ConfigureAwait(false);

                decimal eligible = received - alreadyReturned;
                if (input.Quantity > eligible)
                {
                    throw new CustomException(
                        $"Cannot return {input.Quantity} of medicine {input.MedicineId} to this supplier — " +
                        $"only {Math.Max(0, eligible)} remain eligible (received {received}, already returned {alreadyReturned}).",
                        (IEnumerable<string>?)null, HttpStatusCode.Conflict);
                }
            }

            supplierReturn.AddItem(input.MedicineId, input.Quantity, input.UnitCost, input.ReturnReason, input.Notes);
        }

        await stockDeductionService.DeductForSupplierReturnAsync(
            new StockDeductionRequest(
                ReferenceType: "SupplierReturn",
                ReferenceId: supplierReturn.Id,
                Lines: command.Items.Select(i => new StockDeductionLine(i.MedicineId, i.Quantity)).ToList()),
            cancellationToken).ConfigureAwait(false);

        decimal totalCost = supplierReturn.TotalCost;

        // A return reduces what the pharmacy owes: credit side of the AP ledger.
        decimal newBalance = supplier.ApplyLedgerEntry(debitAmount: 0m, creditAmount: totalCost);
        var ledgerEntry = SupplierLedgerEntry.Create(
            supplier.Id, command.ReturnDateUtc, SupplierLedgerEntryType.Return,
            $"Return to supplier: {command.Notes ?? "goods returned"}", debitAmount: 0m, creditAmount: totalCost,
            runningBalance: newBalance, referenceType: "SupplierReturn", referenceId: supplierReturn.Id, branchId: branchId);

        dbContext.SupplierReturns.Add(supplierReturn);
        dbContext.SupplierLedgerEntries.Add(ledgerEntry);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        if (totalCost > 0)
        {
            var correlationId = Activity.Current?.Id ?? Guid.NewGuid().ToString();
            await outbox.AddAsync(new SupplierReturnCreatedIntegrationEvent(
                Id: Guid.NewGuid(),
                OccurredOnUtc: DateTime.UtcNow,
                TenantId: currentUser.GetTenant(),
                CorrelationId: correlationId,
                Source: "Suppliers",
                SupplierReturnId: supplierReturn.Id,
                SupplierId: supplier.Id,
                TotalCost: totalCost,
                BranchId: branchId,
                ReturnDateUtc: command.ReturnDateUtc),
                cancellationToken).ConfigureAwait(false);
        }

        return supplierReturn.Id;
    }
}
