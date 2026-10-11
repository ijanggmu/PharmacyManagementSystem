using System.Diagnostics;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Customers.Contracts.Events;
using FSH.Modules.Customers.Contracts.v1.Ledger;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Fiscal;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Features.v1.Ledger.RecordCustomerPayment;

/// <summary>
/// Commits the AR ledger entry locally; the offsetting GL voucher (Accounting) is posted
/// asynchronously off <see cref="CustomerPaymentRecordedIntegrationEvent"/> via the Outbox — see
/// docs/pharmacy-modules-plan.md §2. The payment gets a receipt number (RCP-{branch}-{fiscal year}-{n}) when it
/// is recorded at a branch; the number, the ledger entry and the event commit together.
/// </summary>
public sealed class RecordCustomerPaymentCommandHandler(
    CustomersDbContext dbContext,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    ICustomerReceiptNumberService receiptNumbers) : ICommandHandler<RecordCustomerPaymentCommand, Guid>
{
    public async ValueTask<Guid> Handle(RecordCustomerPaymentCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        Guid? branchId = await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);

        // Read before the transaction opens (the branch lives in another module).
        string? branchCode = branchId is { } codeBranchId
            ? await receiptNumbers.ResolveBranchCodeAsync(codeBranchId, cancellationToken).ConfigureAwait(false)
            : null;

        // One transaction: the customer row is locked before its balance is read, so a concurrent sale
        // on account or another payment can't interleave and leave CurrentBalance / RunningBalance wrong.
        return await CustomerWrites.ExecuteAsync(
            dbContext,
            ct => RecordAsync(command, branchId, branchCode, ct),
            cancellationToken).ConfigureAwait(false);
    }

    private async ValueTask<Guid> RecordAsync(
        RecordCustomerPaymentCommand command, Guid? branchId, string? branchCode, CancellationToken cancellationToken)
    {
        var customer = await CustomerWrites.LockAndLoadAsync(dbContext, command.CustomerId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Customer {command.CustomerId} not found.");

        string? receiptNumber = null;
        if (branchId is { } numberBranchId && branchCode is not null)
        {
            int fiscalYear = NepalFiscalYear.StartYearFor(command.PaymentDateUtc);
            int sequence = await receiptNumbers.ReserveNextAsync(numberBranchId, fiscalYear, cancellationToken).ConfigureAwait(false);
            receiptNumber = CustomerReceiptNumberService.Format(branchCode, fiscalYear, sequence);
        }

        // A payment received reduces what the customer owes: credit side of the AR ledger.
        decimal newBalance = customer.ApplyLedgerEntry(debitAmount: 0m, creditAmount: command.Amount);

        var entry = CustomerLedgerEntry.Create(
            customer.Id, command.PaymentDateUtc, CustomerLedgerEntryType.Payment,
            command.Description, debitAmount: 0m, creditAmount: command.Amount, runningBalance: newBalance,
            branchId: branchId, documentNumber: receiptNumber);

        dbContext.CustomerLedgerEntries.Add(entry);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        var correlationId = Activity.Current?.Id ?? Guid.NewGuid().ToString();
        await outbox.AddAsync(new CustomerPaymentRecordedIntegrationEvent(
            Id: Guid.NewGuid(),
            OccurredOnUtc: DateTime.UtcNow,
            TenantId: currentUser.GetTenant(),
            CorrelationId: correlationId,
            Source: "Customers",
            LedgerEntryId: entry.Id,
            CustomerId: customer.Id,
            CustomerName: customer.Name,
            Amount: command.Amount,
            Description: receiptNumber is null ? command.Description : $"{receiptNumber} {command.Description}".Trim(),
            BranchId: branchId,
            PaymentMethod: string.IsNullOrWhiteSpace(command.PaymentMethod) ? null : command.PaymentMethod.Trim()),
            cancellationToken).ConfigureAwait(false);

        return entry.Id;
    }
}
