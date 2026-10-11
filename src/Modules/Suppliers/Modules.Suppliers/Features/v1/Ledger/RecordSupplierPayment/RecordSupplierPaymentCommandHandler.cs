using System.Data;
using System.Diagnostics;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.Events;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Features.v1.Ledger.RecordSupplierPayment;

/// <summary>
/// Commits the AP ledger entry locally; the offsetting GL voucher (Accounting) is posted
/// asynchronously off <see cref="SupplierPaymentRecordedIntegrationEvent"/> via the Outbox — see
/// docs/pharmacy-modules-plan.md §2. A payment against one bill is checked against what is still owed on
/// it (<see cref="SupplierBillAllocator"/>) and carries the bill's reference and numbers.
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

        var supplier = await dbContext.Suppliers
            .FirstOrDefaultAsync(s => s.Id == command.SupplierId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Supplier {command.SupplierId} not found.");

        SupplierBill? bill = null;
        if (command.BillReferenceId is { } billReferenceId)
        {
            var allocation = await SupplierBillAllocator.AllocateForSupplierAsync(dbContext, supplier.Id, cancellationToken)
                .ConfigureAwait(false);
            bill = SupplierPaymentRecorder.ResolveBill(allocation, command.BillReferenceType, billReferenceId, command.Amount);
        }

        Guid? branchId = await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);

        // The ledger entry and its posted event commit together (the outbox joins this transaction).
        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

        var entry = SupplierPaymentRecorder.AddPayment(
            dbContext, supplier, command.Amount, command.PaymentDateUtc, command.Description,
            bill?.ReferenceType, bill?.ReferenceId, bill?.Entry.DocumentNumber, bill?.Entry.SupplierBillNumber, branchId);

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        var correlationId = Activity.Current?.Id ?? Guid.NewGuid().ToString();
        await outbox.AddAsync(
            SupplierPaymentRecorder.BuildEvent(
                currentUser.GetTenant(), correlationId, supplier, entry, command.Description, branchId, command.PaymentMethod),
            cancellationToken).ConfigureAwait(false);

        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return entry.Id;
    }
}
