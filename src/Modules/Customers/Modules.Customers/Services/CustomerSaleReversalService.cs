using FSH.Framework.Core.Exceptions;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Services;

/// <summary>One cancellation, return or refund of a sale, as it affects the sale's customer.</summary>
/// <param name="Kind">"sale-cancel", "sale-return" or "sale-refund" — part of the entries' deterministic ids.</param>
/// <param name="ReferenceType">The AR ledger entry's reference type.</param>
/// <param name="ReferenceId">The cancelled sale / the return / the refund.</param>
/// <param name="CustomerId">The sale's customer.</param>
/// <param name="SaleId">The sale being (partly) reversed — its loyalty entries are looked up by it.</param>
/// <param name="BranchId">Branch stamped on the entries (the sale's branch).</param>
/// <param name="Label">Entry description.</param>
/// <param name="DocumentNumber">Document number on the AR entry (invoice / credit note), when known.</param>
/// <param name="OnAccountCredit">AR to credit back (what the sale still owed that this reversal cancels, or
/// store credit).</param>
/// <param name="LoyaltyShare">CUMULATIVE share of the sale reversed so far, including this reversal, 0..1 —
/// 1 for a cancellation; everything returned/refunded to date over the sale total for a return/refund.
/// Earned points are taken back and redeemed points given back up to this proportion. Being cumulative,
/// partial reversals add up to exactly the whole once the sale is fully reversed, whatever order the
/// events arrive in.</param>
internal sealed record CustomerSaleReversal(
    string Kind,
    string ReferenceType,
    Guid ReferenceId,
    Guid CustomerId,
    Guid SaleId,
    Guid? BranchId,
    decimal OnAccountCredit,
    decimal LoyaltyShare,
    string Label,
    string? DocumentNumber);

/// <summary>
/// Applies <see cref="CustomerSaleReversal"/>s — shared by the SaleCancelled / ReturnCompleted /
/// RefundCompleted handlers. Every entry it writes has a deterministic id (<see cref="CustomerEntryIds"/>)
/// derived from the reversal, and is skipped when that id already exists, so a redelivered event (or one
/// handled twice) never credits AR or moves points twice.
///
/// Loyalty: the points EARNED on the sale (its Earn entries) are taken back, and the points REDEEMED on it
/// (its Redeem entries) are given back, each pro rata of <see cref="CustomerSaleReversal.LoyaltyShare"/> and
/// never past what is left to reverse after earlier reversals of the same sale. Taking back earned points
/// stops at the customer's current balance (points never go negative — they may already be spent).
/// </summary>
internal static class CustomerSaleReversalService
{
    public static async Task ApplyAsync(CustomersDbContext dbContext, CustomerSaleReversal reversal, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(reversal);

        Guid arId = CustomerEntryIds.For($"{reversal.Kind}-ar", reversal.ReferenceId);
        Guid earnId = CustomerEntryIds.For($"{reversal.Kind}-earn", reversal.ReferenceId);
        Guid restoreId = CustomerEntryIds.For($"{reversal.Kind}-restore", reversal.ReferenceId);

        var loyaltyEntries = await dbContext.CustomerLoyaltyEntries
            .AsNoTracking()
            .Where(e => e.SaleId == reversal.SaleId || e.Id == earnId || e.Id == restoreId)
            .Select(e => new { e.Id, e.EntryType, e.Points, e.SaleId })
            .ToListAsync(ct)
            .ConfigureAwait(false);
        bool arDone = reversal.OnAccountCredit <= 0m || await dbContext.CustomerLedgerEntries
            .AnyAsync(e => e.Id == arId, ct)
            .ConfigureAwait(false);

        var forSale = loyaltyEntries.Where(e => e.SaleId == reversal.SaleId).ToList();
        int earned = forSale.Where(e => e.EntryType == LoyaltyEntryType.Earn).Sum(e => e.Points);
        int earnReversed = -forSale.Where(e => e.EntryType == LoyaltyEntryType.EarnReversed).Sum(e => e.Points);
        int redeemed = -forSale.Where(e => e.EntryType == LoyaltyEntryType.Redeem).Sum(e => e.Points);
        int redeemRestored = forSale.Where(e => e.EntryType == LoyaltyEntryType.RedeemRestored).Sum(e => e.Points);

        bool earnDone = loyaltyEntries.Exists(e => e.Id == earnId);
        bool restoreDone = loyaltyEntries.Exists(e => e.Id == restoreId);
        int toTakeBack = earnDone ? 0 : Share(earned, earnReversed, reversal.LoyaltyShare);
        int toGiveBack = restoreDone ? 0 : Share(redeemed, redeemRestored, reversal.LoyaltyShare);

        if (arDone && toTakeBack == 0 && toGiveBack == 0)
        {
            return;
        }

        var customer = await dbContext.Customers
            .FirstOrDefaultAsync(c => c.Id == reversal.CustomerId, ct)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Customer {reversal.CustomerId} not found.");

        if (!arDone)
        {
            // Cancels what the customer owes for the reversed goods: credit side of the AR ledger.
            decimal newBalance = customer.ApplyLedgerEntry(debitAmount: 0m, creditAmount: reversal.OnAccountCredit);
            dbContext.CustomerLedgerEntries.Add(CustomerLedgerEntry.Create(
                customer.Id, DateTime.UtcNow, CustomerLedgerEntryType.Refund, reversal.Label,
                debitAmount: 0m, creditAmount: reversal.OnAccountCredit, runningBalance: newBalance,
                referenceType: reversal.ReferenceType, referenceId: reversal.ReferenceId, branchId: reversal.BranchId,
                documentNumber: reversal.DocumentNumber, id: arId));
        }

        if (toTakeBack > 0)
        {
            int balance = customer.ApplyLoyaltyPoints(-toTakeBack, out int applied);
            dbContext.CustomerLoyaltyEntries.Add(CustomerLoyaltyEntry.Create(
                customer.Id, LoyaltyEntryType.EarnReversed, applied, balance, $"Earned points taken back: {reversal.Label}",
                reversal.SaleId, reversal.BranchId, id: earnId));
        }

        if (toGiveBack > 0)
        {
            int balance = customer.ApplyLoyaltyPoints(toGiveBack, out int applied);
            dbContext.CustomerLoyaltyEntries.Add(CustomerLoyaltyEntry.Create(
                customer.Id, LoyaltyEntryType.RedeemRestored, applied, balance, $"Redeemed points given back: {reversal.Label}",
                reversal.SaleId, reversal.BranchId, id: restoreId));
        }

        await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);
    }

    /// <summary>Points still to reverse so that, in total, <paramref name="cumulativeShare"/> of
    /// <paramref name="total"/> (rounded down; all of it at a share of 1) has been reversed, given
    /// <paramref name="alreadyReversed"/> by earlier reversals of the same sale.</summary>
    internal static int Share(int total, int alreadyReversed, decimal cumulativeShare)
    {
        if (total <= 0 || cumulativeShare <= 0m)
        {
            return 0;
        }

        int target = cumulativeShare >= 1m ? total : (int)Math.Floor(total * cumulativeShare);
        return Math.Clamp(target - alreadyReversed, 0, Math.Max(0, total - alreadyReversed));
    }
}
