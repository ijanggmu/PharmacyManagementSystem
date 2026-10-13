using System.Diagnostics;
using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Customers.Contracts.Events;
using FSH.Modules.Customers.Contracts.v1.Ledger;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Features.v1.Ledger.VoidCustomerPayment;

/// <summary>
/// Voids a customer payment. The ledger is append-only, so the payment's entry is kept and a reversing
/// <see cref="CustomerLedgerEntryType.Adjustment"/> debit is added that references it
/// (<see cref="CustomerLedgerEntry.PaymentVoidReference"/>), at the payment's branch and with its payment method,
/// so branch balances and the cash drawer reverse where the money was taken. The customer's balance goes back
/// up by the payment amount, and <see cref="CustomerPaymentVoidedIntegrationEvent"/> is written to the outbox in
/// the same transaction, from which Accounting reverses the payment's GL voucher dated at the void.
///
/// Customer payments are not allocated to invoices (AR aging settles debts oldest first over the whole
/// account), so there is nothing to un-apply: aging leaves the voided pair out and re-settles the rest.
///
/// Idempotent: the customer row is locked before the "already voided?" check, and the reversing entry's id is
/// derived from the payment (<see cref="CustomerEntryIds"/>), so a second void is refused with 409 and two
/// concurrent ones can never both post.
/// </summary>
public sealed class VoidCustomerPaymentCommandHandler(
    CustomersDbContext dbContext,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch) : ICommandHandler<VoidCustomerPaymentCommand, Guid>
{
    public async ValueTask<Guid> Handle(VoidCustomerPaymentCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        string notFound = $"Payment {command.PaymentId} not found for customer {command.CustomerId}.";
        var branch = await dbContext.CustomerLedgerEntries
            .AsNoTracking()
            .Where(e => e.Id == command.PaymentId && e.CustomerId == command.CustomerId)
            .Select(e => new { e.BranchId })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException(notFound);
        await currentBranch.EnsureCanSeeBranchAsync(branch.BranchId, notFound, cancellationToken).ConfigureAwait(false);

        return await CustomerWrites.ExecuteAsync(
            dbContext,
            ct => VoidAsync(command, notFound, ct),
            cancellationToken).ConfigureAwait(false);
    }

    private async ValueTask<Guid> VoidAsync(VoidCustomerPaymentCommand command, string notFound, CancellationToken cancellationToken)
    {
        // Locked first, so the checks below see every committed void and the balance can't be raced.
        var customer = await CustomerWrites.LockAndLoadAsync(dbContext, command.CustomerId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Customer {command.CustomerId} not found.");

        var payment = await dbContext.CustomerLedgerEntries
            .AsNoTracking()
            .FirstOrDefaultAsync(e => e.Id == command.PaymentId && e.CustomerId == customer.Id, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException(notFound);

        if (payment.EntryType != CustomerLedgerEntryType.Payment || payment.CreditAmount <= 0)
        {
            throw Conflict("Only a payment received from the customer can be voided.");
        }

        bool alreadyVoided = await dbContext.CustomerLedgerEntries
            .AnyAsync(
                e => e.ReferenceType == CustomerLedgerEntry.PaymentVoidReference && e.ReferenceId == payment.Id,
                cancellationToken)
            .ConfigureAwait(false);
        if (alreadyVoided)
        {
            throw Conflict($"Payment {payment.DocumentNumber ?? payment.Id.ToString()} has already been voided.");
        }

        // Dated at the void (never before the payment it reverses), so the payment's own period is not rewritten.
        DateTime voidedAtUtc = DateTime.UtcNow;
        DateTime entryDateUtc = voidedAtUtc < payment.EntryDateUtc ? payment.EntryDateUtc : voidedAtUtc;
        string reason = command.Reason.Trim();
        string document = payment.DocumentNumber ?? "payment";

        // The payment credited the AR ledger; its void debits the same amount back.
        decimal newBalance = customer.ApplyLedgerEntry(debitAmount: payment.CreditAmount, creditAmount: 0m);

        var voidEntry = CustomerLedgerEntry.Create(
            customer.Id, entryDateUtc, CustomerLedgerEntryType.Adjustment,
            Truncate($"Void of {document}: {reason}", 512),
            debitAmount: payment.CreditAmount, creditAmount: 0m, runningBalance: newBalance,
            referenceType: CustomerLedgerEntry.PaymentVoidReference, referenceId: payment.Id,
            branchId: payment.BranchId, documentNumber: payment.DocumentNumber,
            id: CustomerEntryIds.For(CustomerEntryIds.PaymentVoidKind, payment.Id),
            paymentMethod: payment.PaymentMethod);

        dbContext.CustomerLedgerEntries.Add(voidEntry);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        var correlationId = Activity.Current?.Id ?? Guid.NewGuid().ToString();
        await outbox.AddAsync(new CustomerPaymentVoidedIntegrationEvent(
            Id: Guid.NewGuid(),
            OccurredOnUtc: DateTime.UtcNow,
            TenantId: currentUser.GetTenant(),
            CorrelationId: correlationId,
            Source: "Customers",
            LedgerEntryId: payment.Id,
            VoidEntryId: voidEntry.Id,
            CustomerId: customer.Id,
            CustomerName: customer.Name,
            Amount: payment.CreditAmount,
            Reason: reason,
            VoidedAtUtc: entryDateUtc,
            ReceiptNumber: payment.DocumentNumber,
            BranchId: payment.BranchId),
            cancellationToken).ConfigureAwait(false);

        return voidEntry.Id;
    }

    private static CustomException Conflict(string message) =>
        new(message, (IEnumerable<string>?)null, HttpStatusCode.Conflict);

    private static string Truncate(string value, int max) => value.Length <= max ? value : value[..max];
}
