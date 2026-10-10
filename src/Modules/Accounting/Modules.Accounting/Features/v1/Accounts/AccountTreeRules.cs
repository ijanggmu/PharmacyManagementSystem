using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Accounts;

/// <summary>Shared checks for putting accounts under a parent (create and move).</summary>
internal static class AccountTreeRules
{
    /// <summary>
    /// A parent becomes (or stays) a group account, so it must be able to stop taking voucher lines:
    /// root heads always qualify; a system ledger account doesn't (automatic postings target it by code);
    /// an account that already has voucher lines doesn't (its history would sit on a group).
    /// </summary>
    public static async Task EnsureCanHoldChildrenAsync(
        AccountingDbContext dbContext, AccountingAccount parent, CancellationToken cancellationToken)
    {
        if (!parent.IsActive)
        {
            throw BadRequest($"{Label(parent)} is inactive. Reactivate it before adding sub-accounts to it.");
        }

        if (parent.IsRootHead)
        {
            return;
        }

        if (parent.IsSystem)
        {
            throw BadRequest(
                $"{Label(parent)} receives automatic postings, so it can't hold sub-accounts. " +
                "Create a group account instead and move it under that group.");
        }

        bool hasChildren = await dbContext.Accounts
            .AnyAsync(a => a.ParentId == parent.Id, cancellationToken)
            .ConfigureAwait(false);
        if (hasChildren)
        {
            return;
        }

        bool hasPostings = await dbContext.VoucherLines
            .AnyAsync(l => l.AccountId == parent.Id, cancellationToken)
            .ConfigureAwait(false);
        if (hasPostings)
        {
            throw BadRequest(
                $"{Label(parent)} already has voucher entries, so it can't become a group account. " +
                "Pick another parent, or create a new group for these accounts.");
        }
    }

    public static async Task<HashSet<string>> TakenCodesAsync(AccountingDbContext dbContext, CancellationToken cancellationToken) =>
        (await dbContext.Accounts
            .AsNoTracking()
            .Select(a => a.Code)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false))
        .ToHashSet(StringComparer.Ordinal);

    public static string Label(AccountingAccount account) => $"Account {account.Code} {account.Name}";

    public static CustomException BadRequest(string message) =>
        new(message, (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
}
