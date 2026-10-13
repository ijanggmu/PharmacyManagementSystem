using System.Diagnostics;
using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.Events;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Services;
using Mediator;

namespace FSH.Modules.Suppliers.Features.v1.Ledger.RecordSupplierPayment;

/// <summary>
/// Commits the AP ledger entry locally; the offsetting GL voucher (Accounting) is posted
/// asynchronously off <see cref="SupplierPaymentRecordedIntegrationEvent"/> via the Outbox — see
/// docs/pharmacy-modules-plan.md §2. A payment against one bill is checked against what is still owed on
/// it (<see cref="SupplierBillAllocator"/>) and carries the bill's reference and numbers.
///
/// The supplier row is locked (<see cref="SupplierRowLock"/>) inside the transaction BEFORE the bill's
/// outstanding amount is computed and the balance moves, so two payments recorded at the same moment are
/// applied one after the other: the second sees the first and can't over-pay the same bill, and neither
/// balance update is lost.
///
/// TDS withheld (<see cref="RecordSupplierPaymentCommand.TdsAmount"/>) does not change what is settled: the ledger
/// is credited the gross <c>Amount</c> and the entry records the TDS; the event carries it so Accounting posts
/// Dr AP (gross) / Cr Cash-Bank (net) / Cr TDS Payable (TDS).
/// </summary>
public sealed class RecordSupplierPaymentCommandHandler(
    SuppliersDbContext dbContext,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch) : ICommandHandler<RecordSupplierPaymentCommand, Guid>
{
    public async ValueTask<Guid> Handle(RecordSupplierPaymentCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        Guid? branchId = await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);
        string? tenant = currentUser.GetTenant();

        // The ledger entry and its posted event commit together (the outbox joins this transaction).
        return await SupplierRowLock.InTransactionAsync(dbContext, async () =>
        {
            var supplier = await SupplierRowLock.LockAsync(dbContext, command.SupplierId, cancellationToken).ConfigureAwait(false);

            SupplierBill? bill = null;
            if (command.BillReferenceId is { } billReferenceId)
            {
                var allocation = await SupplierBillAllocator.AllocateForSupplierAsync(dbContext, supplier.Id, cancellationToken)
                    .ConfigureAwait(false);
                bill = SupplierPaymentRecorder.ResolveBill(allocation, command.BillReferenceType, billReferenceId, command.Amount);
            }

            var tds = SupplierPaymentTds.From(command);
            var entry = SupplierPaymentRecorder.AddPayment(
                dbContext, supplier, command.Amount, command.PaymentDateUtc, command.Description,
                bill?.ReferenceType, bill?.ReferenceId, bill?.Entry.DocumentNumber, bill?.Entry.SupplierBillNumber, branchId,
                tds?.Amount ?? 0m);

            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

            var correlationId = Activity.Current?.Id ?? Guid.NewGuid().ToString();
            await outbox.AddAsync(
                SupplierPaymentRecorder.BuildEvent(
                    tenant, correlationId, supplier, entry, command.Description, branchId, command.PaymentMethod, tds,
                    SupplierPaymentCheque.From(command)),
                cancellationToken).ConfigureAwait(false);

            return entry.Id;
        }, cancellationToken).ConfigureAwait(false);
    }
}
