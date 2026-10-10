using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Data;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Services;

/// <summary>
/// The single rule for which accounts may take voucher lines: the account exists, is active, and is a
/// leaf of the chart tree (no sub-accounts, not a root head). Group accounts only roll up their children.
/// Called by every path that writes or posts voucher lines — system postings, manual journals (create,
/// update, post).
/// </summary>
public static class AccountingPostableAccounts
{
    public static async Task EnsurePostableAsync(
        AccountingDbContext dbContext, IEnumerable<Guid> accountIds, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(accountIds);

        var ids = accountIds.Distinct().ToList();
        if (ids.Count == 0)
        {
            return;
        }

        var accounts = await dbContext.Accounts
            .AsNoTracking()
            .Where(a => ids.Contains(a.Id))
            .Select(a => new
            {
                a.Id,
                a.Code,
                a.Name,
                a.IsActive,
                IsRootHead = a.ParentId == null && a.IsSystem && a.Code.Length == 1,
                HasChildren = dbContext.Accounts.Any(c => c.ParentId == a.Id),
            })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var problems = new List<string>();
        int missing = ids.Count - accounts.Count;
        if (missing > 0)
        {
            problems.Add(missing == 1 ? "One account does not exist." : $"{missing} accounts do not exist.");
        }

        problems.AddRange(accounts
            .Where(a => !a.IsActive)
            .Select(a => $"Account {a.Code} {a.Name} is inactive."));
        problems.AddRange(accounts
            .Where(a => a.IsActive && (a.IsRootHead || a.HasChildren))
            .Select(a => $"Account {a.Code} {a.Name} is a group account — post to one of its sub-accounts instead."));

        if (problems.Count > 0)
        {
            throw new CustomException(
                problems.Count == 1
                    ? problems[0]
                    : $"{problems.Count} voucher line accounts can't be posted to. {string.Join(" ", problems)}",
                problems,
                HttpStatusCode.BadRequest);
        }
    }
}
