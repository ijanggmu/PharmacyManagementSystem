using System.Globalization;
using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Customers.Contracts.Services;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Services;

/// <summary>
/// Posts a sale's balance and redeemed points to the customer's account inside the Sales transaction. Joins
/// it the same way Inventory's stock deduction does: Npgsql runs every command on the shared connection inside
/// its open transaction, and EF's own transaction is switched off for the save so it doesn't open a nested one.
/// <see cref="IntegrationEventHandlers.SaleCompletedIntegrationEventHandler"/> then finds these entries and
/// only adds the points earned.
/// </summary>
public sealed class CustomerSaleAccount(CustomersDbContext dbContext) : ICustomerSaleAccount
{
    public async Task ApplySaleAsync(SaleAccountPosting posting, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(posting);
        if (posting.BalanceDue <= 0 && posting.PointsRedeemed <= 0)
        {
            return;
        }

        // A retried sale transaction (Sales retries once on a deadlock) must start from database state.
        dbContext.ChangeTracker.Clear();

        await LockCustomerRowAsync(posting.CustomerId, cancellationToken).ConfigureAwait(false);
        var customer = await dbContext.Customers
            .FirstOrDefaultAsync(c => c.Id == posting.CustomerId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new CustomException("Customer not found.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);

        string saleLabel = $"Sale {posting.InvoiceNumber ?? posting.SaleId.ToString()}";

        if (posting.BalanceDue > 0)
        {
            if (!posting.MayExceedCreditLimit && customer.CreditLimit is { } limit && customer.CurrentBalance + posting.BalanceDue > limit)
            {
                decimal available = Math.Max(0m, limit - customer.CurrentBalance);
                throw new CustomException(
                    string.Create(
                        CultureInfo.InvariantCulture,
                        $"{customer.Name} can take at most {available:N2} more on credit (limit {limit:N2}, owes {customer.CurrentBalance:N2}); this sale puts {posting.BalanceDue:N2} on account. Take a payment now, or ask a manager to approve going over the limit."),
                    (IEnumerable<string>?)null, HttpStatusCode.Conflict);
            }

            // A sale on account increases what the customer owes: debit side of the AR ledger.
            decimal newBalance = customer.ApplyLedgerEntry(debitAmount: posting.BalanceDue, creditAmount: 0m);
            dbContext.CustomerLedgerEntries.Add(CustomerLedgerEntry.Create(
                customer.Id, DateTime.UtcNow, CustomerLedgerEntryType.Sale,
                saleLabel, debitAmount: posting.BalanceDue, creditAmount: 0m,
                runningBalance: newBalance, referenceType: "Sale", referenceId: posting.SaleId, branchId: posting.BranchId,
                documentNumber: posting.InvoiceNumber));
        }

        if (posting.PointsRedeemed > 0)
        {
            if (customer.LoyaltyPoints < posting.PointsRedeemed)
            {
                throw new CustomException(
                    string.Create(CultureInfo.InvariantCulture,
                        $"The customer has {customer.LoyaltyPoints} points; {posting.PointsRedeemed} can't be redeemed."),
                    (IEnumerable<string>?)null, HttpStatusCode.Conflict);
            }

            int balance = customer.ApplyLoyaltyPoints(-posting.PointsRedeemed, out int applied);
            dbContext.CustomerLoyaltyEntries.Add(CustomerLoyaltyEntry.Create(
                customer.Id, LoyaltyEntryType.Redeem, applied, balance, $"Redeemed on {saleLabel}", posting.SaleId, posting.BranchId));
        }

        if (!dbContext.Database.IsRelational())
        {
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            return;
        }

        var previous = dbContext.Database.AutoTransactionBehavior;
        dbContext.Database.AutoTransactionBehavior = AutoTransactionBehavior.Never;
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            dbContext.Database.AutoTransactionBehavior = previous;
        }
    }

    private async Task LockCustomerRowAsync(Guid customerId, CancellationToken cancellationToken)
    {
        if (!dbContext.Database.IsRelational())
        {
            return;
        }

        // Tenant-filtered existence check first, so the raw lock never touches another tenant's row.
        bool visible = await dbContext.Customers.AsNoTracking()
            .AnyAsync(c => c.Id == customerId, cancellationToken)
            .ConfigureAwait(false);
        if (!visible)
        {
            return;
        }

        _ = await dbContext.Database.SqlQuery<Guid>($"""
            SELECT "Id" FROM customers."Customers" WHERE "Id" = {customerId} FOR UPDATE
            """).ToArrayAsync(cancellationToken).ConfigureAwait(false);
    }
}
