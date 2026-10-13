using System.Diagnostics;
using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.Events;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Features.v1.Ledger.VoidSupplierPayment;

/// <summary>
/// Voids a supplier payment. The ledger is append-only, so the payment's entry is kept and a reversing
/// <see cref="SupplierLedgerEntryType.Adjustment"/> debit is added that references it
/// (<see cref="SupplierLedgerEntry.PaymentVoidReference"/>), at the payment's branch. The supplier's balance goes
/// back up by the payment amount, and <see cref="SupplierPaymentVoidedIntegrationEvent"/> is written to the
/// outbox in the same transaction, from which Accounting reverses the payment's GL voucher dated at the void.
///
/// Bill allocation is never stored: <see cref="SupplierBillAllocator"/> derives it from the ledger every time and
/// leaves a voided payment and its void out together, so the bill the payment settled (named or oldest-first)
/// is simply open again. Un-applying is therefore always safe and nothing needs refusing.
///
/// Idempotent: the supplier row is locked before the "already voided?" check, and the reversing entry's id is
/// derived from the payment (<see cref="SupplierEntryIds"/>), so a second void is refused with 409 and two
/// concurrent ones can never both post.
/// </summary>
public sealed class VoidSupplierPaymentCommandHandler(
    SuppliersDbContext dbContext,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch) : ICommandHandler<VoidSupplierPaymentCommand, Guid>
{
    public async ValueTask<Guid> Handle(VoidSupplierPaymentCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        string notFound = $"Payment {command.PaymentId} not found for supplier {command.SupplierId}.";
        var branch = await dbContext.SupplierLedgerEntries
            .AsNoTracking()
            .Where(e => e.Id == command.PaymentId && e.SupplierId == command.SupplierId)
            .Select(e => new { e.BranchId })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException(notFound);
        await currentBranch.EnsureCanSeeBranchAsync(branch.BranchId, notFound, cancellationToken).ConfigureAwait(false);

        string? tenant = currentUser.GetTenant();

        return await SupplierRowLock.InTransactionAsync(dbContext, async () =>
        {
            // Locked first, so the checks below see every committed void and the balance can't be raced.
            var supplier = await SupplierRowLock.LockAsync(dbContext, command.SupplierId, cancellationToken).ConfigureAwait(false);

            var payment = await dbContext.SupplierLedgerEntries
                .AsNoTracking()
                .FirstOrDefaultAsync(e => e.Id == command.PaymentId && e.SupplierId == supplier.Id, cancellationToken)
                .ConfigureAwait(false)
                ?? throw new NotFoundException(notFound);

            if (payment.EntryType != SupplierLedgerEntryType.Payment || payment.CreditAmount <= 0)
            {
                throw Conflict("Only a payment made to the supplier can be voided.");
            }

            bool alreadyVoided = await dbContext.SupplierLedgerEntries
                .AnyAsync(
                    e => e.ReferenceType == SupplierLedgerEntry.PaymentVoidReference && e.ReferenceId == payment.Id,
                    cancellationToken)
                .ConfigureAwait(false);
            if (alreadyVoided)
            {
                throw Conflict("This payment has already been voided.");
            }

            // Dated at the void (never before the payment it reverses), so the payment's own period is not rewritten.
            DateTime voidedAtUtc = DateTime.UtcNow;
            DateTime entryDateUtc = voidedAtUtc < payment.EntryDateUtc ? payment.EntryDateUtc : voidedAtUtc;
            string reason = command.Reason.Trim();

            // The payment credited the AP ledger; its void debits the same amount back.
            decimal newBalance = supplier.ApplyLedgerEntry(debitAmount: payment.CreditAmount, creditAmount: 0m);

            string description = $"Void of payment{(payment.DocumentNumber is null ? "" : $" for {payment.DocumentNumber}")}: {reason}";
            var voidEntry = SupplierLedgerEntry.Create(
                supplier.Id, entryDateUtc, SupplierLedgerEntryType.Adjustment,
                description.Length <= 512 ? description : description[..512],
                debitAmount: payment.CreditAmount, creditAmount: 0m, runningBalance: newBalance,
                referenceType: SupplierLedgerEntry.PaymentVoidReference, referenceId: payment.Id,
                branchId: payment.BranchId,
                documentNumber: payment.DocumentNumber, supplierBillNumber: payment.SupplierBillNumber,
                id: SupplierEntryIds.For(SupplierEntryIds.PaymentVoidKind, payment.Id));

            dbContext.SupplierLedgerEntries.Add(voidEntry);
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

            var correlationId = Activity.Current?.Id ?? Guid.NewGuid().ToString();
            await outbox.AddAsync(new SupplierPaymentVoidedIntegrationEvent(
                Id: Guid.NewGuid(),
                OccurredOnUtc: DateTime.UtcNow,
                TenantId: tenant,
                CorrelationId: correlationId,
                Source: "Suppliers",
                LedgerEntryId: payment.Id,
                VoidEntryId: voidEntry.Id,
                SupplierId: supplier.Id,
                SupplierName: supplier.Name,
                Amount: payment.CreditAmount,
                Reason: reason,
                VoidedAtUtc: entryDateUtc,
                BranchId: payment.BranchId),
                cancellationToken).ConfigureAwait(false);

            return voidEntry.Id;
        }, cancellationToken).ConfigureAwait(false);
    }

    private static CustomException Conflict(string message) =>
        new(message, (IEnumerable<string>?)null, HttpStatusCode.Conflict);
}
