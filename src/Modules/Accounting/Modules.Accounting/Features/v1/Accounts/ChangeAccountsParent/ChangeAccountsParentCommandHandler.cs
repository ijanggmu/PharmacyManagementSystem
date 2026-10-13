using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.v1.Accounts;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Accounts.ChangeAccountsParent;

/// <summary>
/// Re-parents the selected accounts under one target, all-or-nothing. Each selected account moves with its
/// whole subtree. Non-system accounts in the moved subtrees get codes regenerated from their new parent
/// (vouchers reference accounts by id, so history is unaffected); system accounts keep their code because
/// automatic postings resolve them by code.
/// </summary>
public sealed class ChangeAccountsParentCommandHandler(AccountingDbContext dbContext)
    : ICommandHandler<ChangeAccountsParentCommand, int>
{
    public async ValueTask<int> Handle(ChangeAccountsParentCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        // The chart is small (hundreds of rows): load it once and validate the tree in memory.
        var all = await dbContext.Accounts.ToListAsync(cancellationToken).ConfigureAwait(false);
        var byId = all.ToDictionary(a => a.Id);
        var children = all
            .Where(a => a.ParentId is not null)
            .GroupBy(a => a.ParentId!.Value)
            .ToDictionary(g => g.Key, g => g.OrderBy(a => a.Code, StringComparer.Ordinal).ToList());

        var target = byId.GetValueOrDefault(command.TargetParentId)
            ?? throw new NotFoundException("The destination account no longer exists.");

        var ids = command.AccountIds.Distinct().ToList();
        var missing = ids.Count(id => !byId.ContainsKey(id));
        if (missing > 0)
        {
            throw new NotFoundException(missing == 1
                ? "One of the selected accounts no longer exists."
                : $"{missing} of the selected accounts no longer exist.");
        }

        var selected = ids.Select(id => byId[id]).OrderBy(a => a.Code, StringComparer.Ordinal).ToList();
        var problems = new List<string>();

        foreach (var root in selected.Where(a => a.IsRootHead))
        {
            problems.Add($"{root.Name} is a root head and can't be moved.");
        }

        // No cycles: the target can't be a selected account or sit inside one's subtree.
        var selectedIds = selected.Select(a => a.Id).ToHashSet();
        for (var cursor = target; cursor is not null; cursor = cursor.ParentId is { } p ? byId.GetValueOrDefault(p) : null)
        {
            if (selectedIds.Contains(cursor.Id))
            {
                problems.Add($"{AccountTreeRules.Label(target)} is {(cursor.Id == target.Id ? "one of the selected accounts" : $"inside {cursor.Code} {cursor.Name}")}, so it can't be the destination.");
                break;
            }
        }

        // Changing head reclassifies a whole subtree; system accounts keep their head.
        foreach (var account in selected.Where(a => a.AccountType != target.AccountType))
        {
            var systemInSubtree = Subtree(account, children).Where(a => a.IsSystem).Select(a => a.Code).ToList();
            if (systemInSubtree.Count > 0)
            {
                problems.Add(
                    $"{AccountTreeRules.Label(account)} would move from {account.AccountType} to {target.AccountType}, " +
                    $"but system account(s) {string.Join(", ", systemInSubtree)} must stay under {account.AccountType}.");
            }
        }

        // Reports derive balances from an account's current head, so changing it would silently move
        // every posted amount (e.g. last year's expense becoming an asset). Once any account in the moving
        // subtree has posted lines, only moves within the same head are allowed.
        var headChanges = selected
            .Where(a => a.AccountType != target.AccountType && !a.IsRootHead)
            .Select(a => (Account: a, Subtree: Subtree(a, children).ToList()))
            .ToList();
        if (headChanges.Count > 0)
        {
            var subtreeIds = headChanges.SelectMany(h => h.Subtree.Select(a => a.Id)).Distinct().ToList();
            var postedIds = (await dbContext.VoucherLines
                    .AsNoTracking()
                    .Where(l => subtreeIds.Contains(l.AccountId)
                             && dbContext.Vouchers.Any(v => v.Id == l.VoucherId && v.Status != AccountingVoucherStatus.Draft))
                    .Select(l => l.AccountId)
                    .Distinct()
                    .ToListAsync(cancellationToken)
                    .ConfigureAwait(false))
                .ToHashSet();

            foreach (var (account, subtree) in headChanges)
            {
                var posted = subtree.Where(a => postedIds.Contains(a.Id)).Select(a => a.Code).ToList();
                if (posted.Count > 0)
                {
                    problems.Add(
                        $"{AccountTreeRules.Label(account)} would move from {account.AccountType} to {target.AccountType}, " +
                        $"but {string.Join(", ", posted)} already {(posted.Count == 1 ? "has" : "have")} posted entries, and changing the head would rewrite past reports. " +
                        $"Move it within {account.AccountType}, or open a new {target.AccountType} account and journal the balance across.");
                }
            }
        }

        if (problems.Count > 0)
        {
            throw new CustomException(
                problems.Count == 1 ? problems[0] : $"Nothing was moved. {string.Join(" ", problems)}",
                problems,
                HttpStatusCode.BadRequest);
        }

        await AccountTreeRules.EnsureCanHoldChildrenAsync(dbContext, target, cancellationToken).ConfigureAwait(false);

        var taken = all.Select(a => a.Code).ToHashSet(StringComparer.Ordinal);
        int moved = 0;
        try
        {
            foreach (var account in selected)
            {
                if (account.ParentId == target.Id)
                {
                    continue;
                }

                string? newCode = account.IsSystem ? null : AccountCodeAllocator.NextChildCode(target, taken);
                account.MoveUnder(target, newCode);
                RecodeDescendants(account, children, selectedIds, taken);
                moved++;
            }
        }
        catch (InvalidOperationException ex)
        {
            throw AccountTreeRules.BadRequest(ex.Message);
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return moved;
    }

    /// <summary>Gives every non-system descendant a code under its (possibly new) parent, and the parent's head.</summary>
    private static void RecodeDescendants(
        AccountingAccount parent,
        IReadOnlyDictionary<Guid, List<AccountingAccount>> children,
        IReadOnlySet<Guid> selectedIds,
        ISet<string> taken)
    {
        if (!children.TryGetValue(parent.Id, out var kids))
        {
            return;
        }

        // A selected descendant is moved on its own (directly under the target), so it doesn't follow this parent.
        foreach (var child in kids.Where(k => !selectedIds.Contains(k.Id)))
        {
            child.ChangeType(parent.AccountType);
            if (!child.IsSystem)
            {
                child.Recode(AccountCodeAllocator.NextChildCode(parent, taken));
            }

            RecodeDescendants(child, children, selectedIds, taken);
        }
    }

    private static IEnumerable<AccountingAccount> Subtree(
        AccountingAccount account, IReadOnlyDictionary<Guid, List<AccountingAccount>> children)
    {
        yield return account;
        if (children.TryGetValue(account.Id, out var kids))
        {
            foreach (var descendant in kids.SelectMany(k => Subtree(k, children)))
            {
                yield return descendant;
            }
        }
    }
}
