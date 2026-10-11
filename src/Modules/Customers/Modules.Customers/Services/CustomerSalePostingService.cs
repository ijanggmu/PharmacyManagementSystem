using System.Globalization;
using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Customers.Contracts.Services;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Services;

/// <summary>
/// See <see cref="ICustomerSalePostingService"/>. Runs inside the Sales transaction on the scope's shared
/// connection: EF's automatic transaction is switched off for the save (Npgsql runs every command on the
/// connection inside its current transaction), so the customer's ledger/loyalty rows commit or roll back
/// with the sale — the same arrangement as Inventory's <c>StockDeductionService</c>.
/// </summary>
public sealed class CustomerSalePostingService(CustomersDbContext dbContext) : ICustomerSalePostingService
{
    public const string SaleReferenceType = "Sale";

    public async Task PostSaleAsync(CustomerSalePosting posting, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(posting);

        if (posting.BalanceDue <= 0m && posting.PointsRedeemed <= 0)
        {
            return;
        }

        await LockCustomerRowAsync(posting.CustomerId, cancellationToken).ConfigureAwait(false);

        // Re-read after the lock: a previous sale of this customer may have committed since this scope
        // last saw the row.
        var tracked = dbContext.ChangeTracker.Entries<Customer>().FirstOrDefault(e => e.Entity.Id == posting.CustomerId);
        if (tracked is not null)
        {
            await tracked.ReloadAsync(cancellationToken).ConfigureAwait(false);
        }

        var customer = await dbContext.Customers
            .FirstOrDefaultAsync(c => c.Id == posting.CustomerId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Customer {posting.CustomerId} not found.");

        Guid arEntryId = CustomerEntryIds.For(CustomerEntryIds.SaleArKind, posting.SaleId);
        Guid redeemEntryId = CustomerEntryIds.For(CustomerEntryIds.SaleRedeemKind, posting.SaleId);
        bool arDone = await dbContext.CustomerLedgerEntries
            .AnyAsync(e => e.Id == arEntryId || (e.ReferenceType == SaleReferenceType && e.ReferenceId == posting.SaleId), cancellationToken)
            .ConfigureAwait(false);
        bool redeemDone = await dbContext.CustomerLoyaltyEntries
            .AnyAsync(e => e.Id == redeemEntryId || (e.SaleId == posting.SaleId && e.EntryType == LoyaltyEntryType.Redeem), cancellationToken)
            .ConfigureAwait(false);

        string saleLabel = $"Sale {posting.InvoiceNumber ?? posting.SaleId.ToString()}";

        if (posting.BalanceDue > 0m && !arDone)
        {
            EnforceCreditLimit(customer, posting);
            decimal newBalance = customer.ApplyLedgerEntry(debitAmount: posting.BalanceDue, creditAmount: 0m);
            dbContext.CustomerLedgerEntries.Add(CustomerLedgerEntry.Create(
                customer.Id, DateTime.UtcNow, CustomerLedgerEntryType.Sale, saleLabel,
                debitAmount: posting.BalanceDue, creditAmount: 0m, runningBalance: newBalance,
                referenceType: SaleReferenceType, referenceId: posting.SaleId, branchId: posting.BranchId,
                documentNumber: posting.InvoiceNumber, id: arEntryId));
        }

        if (posting.PointsRedeemed > 0 && !redeemDone)
        {
            if (posting.PointsRedeemed > customer.LoyaltyPoints)
            {
                throw new CustomException(
                    string.Create(
                        CultureInfo.InvariantCulture,
                        $"{customer.Name} now has {customer.LoyaltyPoints} points; {posting.PointsRedeemed} can't be redeemed. Another sale may have just used them."),
                    (IEnumerable<string>?)null,
                    HttpStatusCode.Conflict);
            }

            int balance = customer.ApplyLoyaltyPoints(-posting.PointsRedeemed, out int applied);
            dbContext.CustomerLoyaltyEntries.Add(CustomerLoyaltyEntry.Create(
                customer.Id, LoyaltyEntryType.Redeem, applied, balance, $"Redeemed on {saleLabel}",
                posting.SaleId, posting.BranchId, id: redeemEntryId));
        }

        await SaveInCallerTransactionAsync(cancellationToken).ConfigureAwait(false);
    }

    private static void EnforceCreditLimit(Customer customer, CustomerSalePosting posting)
    {
        if (posting.MayExceedCreditLimit || customer.CreditLimit is not { } limit || customer.CurrentBalance + posting.BalanceDue <= limit)
        {
            return;
        }

        decimal available = Math.Max(0m, limit - customer.CurrentBalance);
        throw new CustomException(
            string.Create(
                CultureInfo.InvariantCulture,
                $"{customer.Name} can take at most {available:N2} more on credit (limit {limit:N2}, owes {customer.CurrentBalance:N2}); this sale puts {posting.BalanceDue:N2} on account. Take a payment now, or ask a manager to approve going over the limit."),
            (IEnumerable<string>?)null,
            HttpStatusCode.Conflict);
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

    private async Task SaveInCallerTransactionAsync(CancellationToken cancellationToken)
    {
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
}
