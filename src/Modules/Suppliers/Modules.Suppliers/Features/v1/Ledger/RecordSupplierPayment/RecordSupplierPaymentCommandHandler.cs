using System.Diagnostics;
using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.v1.Cheques;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Fiscal;
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
    ICurrentBranch currentBranch,
    ISupplierPaymentNumberService paymentNumbers,
    IMediator mediator) : ICommandHandler<RecordSupplierPaymentCommand, Guid>
{
    public async ValueTask<Guid> Handle(RecordSupplierPaymentCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        // Other modules are read before the transaction opens: the cheque register (the same cheque can't pay
        // twice; a bounced or cancelled one doesn't count) and the branch code for the payment number.
        if (!string.IsNullOrWhiteSpace(command.ChequeNumber))
        {
            await EnsureChequeNotInUseAsync(command.SupplierId, command.ChequeNumber.Trim(), cancellationToken).ConfigureAwait(false);
        }

        Guid? branchId = await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);
        string? branchCode = branchId is { } codeBranchId
            ? await paymentNumbers.ResolveBranchCodeAsync(codeBranchId, cancellationToken).ConfigureAwait(false)
            : null;
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
            if (branchId is { } numberBranchId && branchCode is not null)
            {
                int fiscalYear = NepalFiscalYear.StartYearFor(command.PaymentDateUtc);
                int sequence = await paymentNumbers.ReserveNextAsync(numberBranchId, fiscalYear, cancellationToken).ConfigureAwait(false);
                entry.AssignPaymentNumber(SupplierPaymentNumberService.Format(branchCode, fiscalYear, sequence));
            }

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

    private async Task EnsureChequeNotInUseAsync(Guid supplierId, string chequeNumber, CancellationToken cancellationToken)
    {
        bool inUse = await mediator.Send(
            new IsChequeNumberInUseQuery(ChequePaymentReferenceTypes.SupplierPayment, supplierId, chequeNumber), cancellationToken)
            .ConfigureAwait(false);
        if (!inUse)
        {
            return;
        }

        string? name = await dbContext.Suppliers.AsNoTracking()
            .Where(s => s.Id == supplierId)
            .Select(s => s.Name)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);
        throw new CustomException(
            $"Cheque {chequeNumber} to {name ?? "this supplier"} is already recorded.",
            (IEnumerable<string>?)null, HttpStatusCode.Conflict);
    }
}
