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

        // Forget anything this scope tracked earlier (a pre-transaction credit check, or a previous attempt of
        // a sale the caller is retrying after a deadlock/serialization failure): the customer must be read
        // after the lock, and a failed attempt's still-Added ledger/loyalty rows must not be saved again.
        dbContext.ChangeTracker.Clear();

        // Locked, then read: a previous sale of this customer may have committed since this scope last saw
        // the row. Deleted customers are loaded too, only to tell "deleted" (409) apart from "unknown" (404).
        var customer = await CustomerWrites.LockAndLoadAsync(dbContext, posting.CustomerId, cancellationToken, includeDeleted: true)
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

        if ((posting.BalanceDue > 0m && !arDone) || (posting.PointsRedeemed > 0 && !redeemDone))
        {
            EnsureCanTakeSale(customer);
        }

        string saleLabel = $"Sale {posting.InvoiceNumber ?? posting.SaleId.ToString()}";

        if (posting.BalanceDue > 0m && !arDone)
        {
            EnforceCreditLimit(customer, posting);
            decimal newBalance = customer.ApplyLedgerEntry(debitAmount: posting.BalanceDue, creditAmount: 0m);
            DateTime saleDateUtc = DateTime.UtcNow;
            dbContext.CustomerLedgerEntries.Add(CustomerLedgerEntry.Create(
                customer.Id, saleDateUtc, CustomerLedgerEntryType.Sale, saleLabel,
                debitAmount: posting.BalanceDue, creditAmount: 0m, runningBalance: newBalance,
                referenceType: SaleReferenceType, referenceId: posting.SaleId, branchId: posting.BranchId,
                documentNumber: posting.InvoiceNumber, id: arEntryId,
                // The balance left on account falls due under the customer's payment terms.
                dueDateUtc: customer.DueDateFor(saleDateUtc)));
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

    /// <summary>Re-checked under the row lock: a customer deactivated or deleted after the cashier picked
    /// them (or after the pre-transaction credit check) must not get a new balance on account or spend points.</summary>
    private static void EnsureCanTakeSale(Customer customer)
    {
        if (customer.IsDeleted)
        {
            throw new CustomException(
                $"{customer.Name} has been deleted and can't be put on account or redeem points. Restore the customer or take the sale as a walk-in.",
                (IEnumerable<string>?)null,
                HttpStatusCode.Conflict);
        }

        if (!customer.IsActive)
        {
            throw new CustomException(
                $"{customer.Name} is inactive and can't be put on account or redeem points. Reactivate the customer first.",
                (IEnumerable<string>?)null,
                HttpStatusCode.Conflict);
        }
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
