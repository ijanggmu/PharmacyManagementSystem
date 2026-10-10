using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Sales.Contracts.Events;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.IntegrationEventHandlers;

/// <summary>Posts the AR ledger entry for a credit sale's balance due. A no-op when the sale was paid
/// in full (<see cref="SaleCompletedIntegrationEvent.BalanceDue"/> is zero). Stamps the ledger entry
/// with the originating sale's own <see cref="SaleCompletedIntegrationEvent.BranchId"/> rather than
/// resolving one ambiently — this handler runs off the Outbox/background dispatcher, which has no
/// per-request branch context to resolve (see docs/branch-scoping-plan.md wave-2 notes).</summary>
public sealed class SaleCompletedIntegrationEventHandler(CustomersDbContext dbContext)
    : IIntegrationEventHandler<SaleCompletedIntegrationEvent>
{
    public async Task HandleAsync(SaleCompletedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        if (@event.BalanceDue <= 0 || @event.CustomerId is not { } customerId)
        {
            return;
        }

        var customer = await dbContext.Customers
            .FirstOrDefaultAsync(c => c.Id == customerId, ct)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Customer {customerId} not found.");

        // A sale on account increases what the customer owes: debit side of the AR ledger.
        decimal newBalance = customer.ApplyLedgerEntry(debitAmount: @event.BalanceDue, creditAmount: 0m);

        var entry = CustomerLedgerEntry.Create(
            customer.Id, DateTime.UtcNow, CustomerLedgerEntryType.Sale,
            $"Sale {@event.InvoiceNumber ?? @event.SaleId.ToString()}", debitAmount: @event.BalanceDue, creditAmount: 0m,
            runningBalance: newBalance, referenceType: "Sale", referenceId: @event.SaleId, branchId: @event.BranchId,
            documentNumber: @event.InvoiceNumber);

        dbContext.CustomerLedgerEntries.Add(entry);
        await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);
    }
}
