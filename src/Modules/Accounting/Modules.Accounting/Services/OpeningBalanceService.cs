using System.Data;
using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.OpeningBalances;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Multitenancy.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Accounting.Services;

/// <summary>
/// Sets, edits and resets a branch's opening balances (rule.md §9.1). A posted opening voucher is never
/// changed: Edit reverses it (a reversal voucher pointing back at it, dated on the old opening date) and
/// posts a new one; Reset only reverses it. Every change writes an <see cref="OpeningBalanceHistoryEntry"/>,
/// and the vouchers plus the history row commit in one transaction.
/// <para>
/// Idempotency: the client's <c>RequestId</c> becomes the history entry id and the new voucher's
/// reference id, so a retry returns the first result. Concurrency: Edit/Reset carry the version they
/// read, and the unique (branch, sequence) index rejects a second writer that slipped past that check.
/// </para>
/// </summary>
public sealed partial class OpeningBalanceService(
    AccountingDbContext dbContext,
    IAccountingVoucherNumbers voucherNumbers,
    AccountingPostingLockService postingLockService,
    ICurrentBranch currentBranch,
    IBranchService branchService,
    ICurrentUser currentUser,
    ILogger<OpeningBalanceService> logger)
{
    /// <summary>Voucher type the onboarding migration wizard posts its opening vouchers with.</summary>
    internal const string LegacyMigrationVoucherType = "system_opening_balance";

    public async ValueTask<OpeningBalanceStateDto> GetStateAsync(Guid? requestedBranchId, CancellationToken cancellationToken = default)
    {
        Guid branchId = await ResolveBranchAsync(requestedBranchId, cancellationToken).ConfigureAwait(false);
        var latest = await LatestAsync(branchId, cancellationToken).ConfigureAwait(false);

        var equity = await dbContext.Accounts.AsNoTracking()
            .Where(a => a.Code == AccountingSystemAccountCodes.OwnersEquity)
            .Select(a => new { a.Id, a.Name })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

        var lockRow = await dbContext.PostingLocks.AsNoTracking().FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);

        int legacyCount = await dbContext.Vouchers.AsNoTracking()
            .CountAsync(v => v.VoucherType == LegacyMigrationVoucherType
                          && v.Status == AccountingVoucherStatus.Posted
                          // Same rule as a branch-filtered trial balance: only this branch's vouchers.
                          // Legacy vouchers without a branch are attributed to the default branch by
                          // AccountingDbInitializer, so none remain unassigned after seeding.
                          && v.BranchId == branchId, cancellationToken)
            .ConfigureAwait(false);

        bool isSet = latest is { LeavesActiveOpening: true };
        var entries = isSet ? latest!.ReadEntries() : [];
        string? voucherNo = null;
        if (isSet && latest!.PostedVoucherId is { } voucherId)
        {
            voucherNo = await dbContext.Vouchers.AsNoTracking()
                .Where(v => v.Id == voucherId)
                .Select(v => v.VoucherNo)
                .FirstOrDefaultAsync(cancellationToken)
                .ConfigureAwait(false);
        }

        var (debit, credit) = OpeningBalanceRules.Totals(entries);
        var (adjDebit, adjCredit) = OpeningBalanceRules.EquityAdjustment(entries);

        return new OpeningBalanceStateDto(
            branchId,
            isSet,
            isSet ? latest!.OpeningDate : null,
            isSet ? latest!.PostedVoucherId : null,
            voucherNo,
            debit,
            credit,
            entries.Count == 0 ? 0m : adjDebit,
            entries.Count == 0 ? 0m : adjCredit,
            equity?.Id,
            AccountingSystemAccountCodes.OwnersEquity,
            equity?.Name,
            entries.Select(ToDto).ToList(),
            latest?.Sequence ?? 0,
            latest?.PerformedAtUtc,
            latest?.PerformedByName,
            lockRow?.LockDate,
            legacyCount);
    }

    public async ValueTask<OpeningBalanceMutationResultDto> SetAsync(SetOpeningBalancesCommand command, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(command);

        if (await FindReplayAsync(command.RequestId, OpeningBalanceAction.Set, cancellationToken).ConfigureAwait(false) is { } replay)
        {
            return replay;
        }

        Guid branchId = await ResolveBranchAsync(command.BranchId, cancellationToken).ConfigureAwait(false);
        var latest = await LatestAsync(branchId, cancellationToken).ConfigureAwait(false);
        if (latest is { LeavesActiveOpening: true })
        {
            throw Conflict("Opening balances are already set for this branch. Use Edit to change them, or Reset to start over.");
        }

        var entries = await LoadEntriesAsync(command.Lines, cancellationToken).ConfigureAwait(false);
        await AssertDateOpenAsync(command.OpeningDate, "the opening date", cancellationToken).ConfigureAwait(false);
        Guid equityId = await ResolveEquityAccountAsync(entries, cancellationToken).ConfigureAwait(false);

        var (userId, userName) = CurrentUser();
        return await InTransactionAsync(async () =>
        {
            var voucher = await PostOpeningVoucherAsync(
                branchId, command.OpeningDate, entries, equityId, command.RequestId, userName, cancellationToken).ConfigureAwait(false);

            var entry = OpeningBalanceHistoryEntry.Record(
                command.RequestId, branchId, (latest?.Sequence ?? 0) + 1, OpeningBalanceAction.Set,
                command.OpeningDate, previousOpeningDate: null,
                postedVoucherId: voucher.Id, reversedVoucherId: null, reversalVoucherId: null,
                entries, OpeningBalanceRules.BuildChanges([], entries), command.Reason, userId, userName);

            return await CommitAsync(entry, cancellationToken).ConfigureAwait(false);
        }, cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<OpeningBalanceMutationResultDto> EditAsync(EditOpeningBalancesCommand command, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(command);

        if (await FindReplayAsync(command.RequestId, OpeningBalanceAction.Edit, cancellationToken).ConfigureAwait(false) is { } replay)
        {
            return replay;
        }

        string reason = OpeningBalanceRules.RequireReason(command.Reason);
        Guid branchId = await ResolveBranchAsync(command.BranchId, cancellationToken).ConfigureAwait(false);
        var current = await RequireActiveAsync(branchId, command.ExpectedVersion, "edit", cancellationToken).ConfigureAwait(false);

        var before = current.ReadEntries();
        var after = await LoadEntriesAsync(command.Lines, cancellationToken).ConfigureAwait(false);
        var changes = OpeningBalanceRules.BuildChanges(before, after);
        if (changes.Count == 0 && current.OpeningDate == command.OpeningDate)
        {
            throw new CustomException(
                "Nothing changed: the opening date and every amount match the current opening balances.",
                (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        DateOnly previousDate = current.OpeningDate!.Value;
        await AssertDateOpenAsync(previousDate, "the current opening date", cancellationToken).ConfigureAwait(false);
        await AssertDateOpenAsync(command.OpeningDate, "the new opening date", cancellationToken).ConfigureAwait(false);
        Guid equityId = await ResolveEquityAccountAsync(after, cancellationToken).ConfigureAwait(false);

        var (userId, userName) = CurrentUser();
        return await InTransactionAsync(async () =>
        {
            var reversal = await ReverseOpeningVoucherAsync(current.PostedVoucherId!.Value, previousDate, userName, cancellationToken).ConfigureAwait(false);
            var voucher = await PostOpeningVoucherAsync(
                branchId, command.OpeningDate, after, equityId, command.RequestId, userName, cancellationToken).ConfigureAwait(false);

            var entry = OpeningBalanceHistoryEntry.Record(
                command.RequestId, branchId, current.Sequence + 1, OpeningBalanceAction.Edit,
                command.OpeningDate, previousDate,
                postedVoucherId: voucher.Id, reversedVoucherId: current.PostedVoucherId, reversalVoucherId: reversal.Id,
                after, changes, reason, userId, userName);

            return await CommitAsync(entry, cancellationToken).ConfigureAwait(false);
        }, cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<OpeningBalanceMutationResultDto> ResetAsync(ResetOpeningBalancesCommand command, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(command);

        if (await FindReplayAsync(command.RequestId, OpeningBalanceAction.Reset, cancellationToken).ConfigureAwait(false) is { } replay)
        {
            return replay;
        }

        string reason = OpeningBalanceRules.RequireReason(command.Reason);
        Guid branchId = await ResolveBranchAsync(command.BranchId, cancellationToken).ConfigureAwait(false);
        var current = await RequireActiveAsync(branchId, command.ExpectedVersion, "reset", cancellationToken).ConfigureAwait(false);

        DateOnly previousDate = current.OpeningDate!.Value;
        await AssertDateOpenAsync(previousDate, "the current opening date", cancellationToken).ConfigureAwait(false);

        var before = current.ReadEntries();
        var (userId, userName) = CurrentUser();
        return await InTransactionAsync(async () =>
        {
            var reversal = await ReverseOpeningVoucherAsync(current.PostedVoucherId!.Value, previousDate, userName, cancellationToken).ConfigureAwait(false);

            var entry = OpeningBalanceHistoryEntry.Record(
                command.RequestId, branchId, current.Sequence + 1, OpeningBalanceAction.Reset,
                openingDate: null, previousDate,
                postedVoucherId: null, reversedVoucherId: current.PostedVoucherId, reversalVoucherId: reversal.Id,
                [], OpeningBalanceRules.BuildChanges(before, []), reason, userId, userName);

            return await CommitAsync(entry, cancellationToken).ConfigureAwait(false);
        }, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>The single branch an opening-balance read or write applies to: the requested one (only
    /// a caller who may view every branch can name another branch) or the caller's own.</summary>
    internal async ValueTask<Guid> ResolveBranchAsync(Guid? requestedBranchId, CancellationToken cancellationToken)
    {
        Guid? resolved = await currentBranch.ResolveListBranchFilterAsync(requestedBranchId, cancellationToken).ConfigureAwait(false);
        if (resolved is { } branchId)
        {
            if (requestedBranchId is not null
                && !await branchService.IsActiveBranchOfCurrentTenantAsync(branchId, cancellationToken).ConfigureAwait(false))
            {
                throw new NotFoundException($"Branch {branchId} not found.");
            }

            return branchId;
        }

        return await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);
    }

    internal static OpeningBalanceLineDto ToDto(OpeningBalanceEntry e) =>
        new(e.AccountId, e.AccountCode, e.AccountName, e.AccountType, e.DebitAmount, e.CreditAmount);

    private Task<OpeningBalanceHistoryEntry?> LatestAsync(Guid branchId, CancellationToken cancellationToken) =>
        dbContext.OpeningBalanceHistory.AsNoTracking()
            .Where(h => h.BranchId == branchId)
            .OrderByDescending(h => h.Sequence)
            .FirstOrDefaultAsync(cancellationToken);

    private async ValueTask<OpeningBalanceHistoryEntry> RequireActiveAsync(
        Guid branchId, int expectedVersion, string verb, CancellationToken cancellationToken)
    {
        var latest = await LatestAsync(branchId, cancellationToken).ConfigureAwait(false);
        if (latest is not { LeavesActiveOpening: true })
        {
            throw Conflict($"There are no opening balances to {verb} for this branch.");
        }

        if (latest.Sequence != expectedVersion)
        {
            throw Conflict("Opening balances were changed by someone else since you opened them. Reload to see the latest figures, then try again.");
        }

        return latest;
    }

    /// <summary>A request id that already has a history entry is a retry: return its result, or refuse
    /// when the id was used for a different action.</summary>
    private async ValueTask<OpeningBalanceMutationResultDto?> FindReplayAsync(
        Guid requestId, OpeningBalanceAction action, CancellationToken cancellationToken)
    {
        var existing = await dbContext.OpeningBalanceHistory.AsNoTracking()
            .FirstOrDefaultAsync(h => h.Id == requestId, cancellationToken)
            .ConfigureAwait(false);
        if (existing is null)
        {
            return null;
        }

        if (existing.Action != action)
        {
            throw Conflict("This request was already used for a different opening-balance change. Reload and try again.");
        }

        return ToResult(existing);
    }

    /// <summary>Loads each line's account and checks it can carry an opening balance: exists, active,
    /// a leaf of the chart, and an asset, liability or equity account.</summary>
    private async ValueTask<List<OpeningBalanceEntry>> LoadEntriesAsync(
        IReadOnlyList<OpeningBalanceLineInput> lines, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(lines);
        var ids = lines.Select(l => l.AccountId).Distinct().ToList();

        var accounts = await dbContext.Accounts.AsNoTracking()
            .Where(a => ids.Contains(a.Id))
            .Select(a => new { a.Id, a.Code, a.Name, a.AccountType })
            .ToDictionaryAsync(a => a.Id, cancellationToken)
            .ConfigureAwait(false);

        var entries = lines
            .Select(l => accounts.TryGetValue(l.AccountId, out var a)
                ? new OpeningBalanceEntry(a.Id, a.Code, a.Name, a.AccountType.ToString(), l.DebitAmount, l.CreditAmount)
                : new OpeningBalanceEntry(l.AccountId, "?", "Unknown account", string.Empty, l.DebitAmount, l.CreditAmount))
            .ToList();

        OpeningBalanceRules.ValidateLines(entries);
        await AccountingPostableAccounts.EnsurePostableAsync(dbContext, ids, cancellationToken).ConfigureAwait(false);

        var wrongHead = accounts.Values
            .Where(a => !OpeningBalanceRules.IsBalanceSheetType(a.AccountType))
            .Select(a => $"{a.Code} {a.Name}")
            .ToList();
        if (wrongHead.Count > 0)
        {
            throw new CustomException(
                $"Opening balances are for asset, liability and equity accounts only. Remove: {string.Join(", ", wrongHead)}.",
                wrongHead, HttpStatusCode.BadRequest);
        }

        return entries;
    }

    /// <summary>Owner's Equity takes the balancing difference; only required when there is one.</summary>
    private async ValueTask<Guid> ResolveEquityAccountAsync(IReadOnlyCollection<OpeningBalanceEntry> entries, CancellationToken cancellationToken)
    {
        Guid? equityId = await dbContext.Accounts.AsNoTracking()
            .Where(a => a.Code == AccountingSystemAccountCodes.OwnersEquity)
            .Select(a => (Guid?)a.Id)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

        var (adjDebit, adjCredit) = OpeningBalanceRules.EquityAdjustment(entries);
        bool needed = adjDebit > 0 || adjCredit > 0;
        if (!needed)
        {
            return equityId ?? Guid.Empty;
        }

        if (equityId is null)
        {
            throw Conflict($"The Owner's Equity account ({AccountingSystemAccountCodes.OwnersEquity}) is missing, so the difference can't be balanced. Enter balances that balance on their own, or restore the account.");
        }

        await AccountingPostableAccounts.EnsurePostableAsync(dbContext, [equityId.Value], cancellationToken).ConfigureAwait(false);
        return equityId.Value;
    }

    private async ValueTask AssertDateOpenAsync(DateOnly date, string label, CancellationToken cancellationToken)
    {
        var lockRow = await postingLockService.GetOrCreateAsync(cancellationToken).ConfigureAwait(false);
        if (lockRow.LockDate is { } locked && date <= locked)
        {
            throw Conflict(
                $"The books are locked up to {locked:yyyy-MM-dd}, and {label} ({date:yyyy-MM-dd}) falls in that locked period. " +
                "Move the posting lock date back first, or choose a later opening date.");
        }
    }

    private async ValueTask<AccountingVoucher> PostOpeningVoucherAsync(
        Guid branchId, DateOnly openingDate, IReadOnlyCollection<OpeningBalanceEntry> entries, Guid equityId,
        Guid referenceId, string postedBy, CancellationToken cancellationToken)
    {
        var voucher = AccountingVoucher.CreateDraft(
            ToUtc(openingDate), OpeningBalanceRules.VoucherType, AccountingVoucherSource.System,
            $"Opening balances as at {openingDate:yyyy-MM-dd}", OpeningBalanceRules.ReferenceType, referenceId, branchId);

        foreach (var line in OpeningBalanceRules.BuildVoucherLines(entries, equityId))
        {
            voucher.AddLine(line.AccountId, line.Description, line.DebitAmount, line.CreditAmount);
        }

        int number = await voucherNumbers.ReserveNextNumberAsync(cancellationToken).ConfigureAwait(false);
        voucher.Post($"OB-{number:D6}", postedBy);
        dbContext.Vouchers.Add(voucher);
        return voucher;
    }

    /// <summary>Reverses the active opening voucher on its own date, so reports from that date on show
    /// only the replacement figures.</summary>
    private async ValueTask<AccountingVoucher> ReverseOpeningVoucherAsync(
        Guid voucherId, DateOnly openingDate, string reversedBy, CancellationToken cancellationToken)
    {
        var voucher = await dbContext.Vouchers
            .Include(v => v.Lines)
            .FirstOrDefaultAsync(v => v.Id == voucherId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw Conflict("The current opening voucher no longer exists.");

        if (voucher.Status != AccountingVoucherStatus.Posted)
        {
            throw Conflict($"The current opening voucher {voucher.VoucherNo} is {voucher.Status}, so it can't be reversed again.");
        }

        bool alreadyReversed = await dbContext.Vouchers.AsNoTracking()
            .AnyAsync(v => v.ReversesVoucherId == voucherId && v.Status == AccountingVoucherStatus.Posted, cancellationToken)
            .ConfigureAwait(false);
        if (alreadyReversed)
        {
            throw Conflict($"The current opening voucher {voucher.VoucherNo} was already reversed.");
        }

        int number = await voucherNumbers.ReserveNextNumberAsync(cancellationToken).ConfigureAwait(false);
        var reversal = voucher.CreateReversal($"RV-{number:D6}", reversedBy, ToUtc(openingDate));
        dbContext.Vouchers.Add(reversal);
        return reversal;
    }

    private async ValueTask<OpeningBalanceMutationResultDto> CommitAsync(OpeningBalanceHistoryEntry entry, CancellationToken cancellationToken)
    {
        dbContext.OpeningBalanceHistory.Add(entry);
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (DbUpdateException ex)
        {
            throw new CustomException(
                "Opening balances were changed by someone else at the same time. Reload and try again.",
                ex, HttpStatusCode.Conflict);
        }

        LogOpeningBalanceChanged(logger, entry.Action, entry.BranchId, entry.Sequence, entry.PostedVoucherId, entry.ReversedVoucherId);
        return ToResult(entry);
    }

    /// <summary>One READ COMMITTED transaction around the vouchers, the voucher-number reservations and the
    /// history row. Non-relational providers (InMemory tests) have no transactions; a single SaveChanges
    /// is still all-or-nothing there.</summary>
    private async ValueTask<T> InTransactionAsync<T>(Func<ValueTask<T>> work, CancellationToken cancellationToken)
    {
        if (!dbContext.Database.IsRelational() || dbContext.Database.CurrentTransaction is not null)
        {
            return await work().ConfigureAwait(false);
        }

        await using IDbContextTransaction transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

        var result = await work().ConfigureAwait(false);
        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return result;
    }

    private (Guid UserId, string UserName) CurrentUser()
    {
        Guid userId = currentUser.GetUserId();
        string name = string.IsNullOrWhiteSpace(currentUser.Name) ? userId.ToString() : currentUser.Name;
        return (userId, name);
    }

    private static OpeningBalanceMutationResultDto ToResult(OpeningBalanceHistoryEntry entry) =>
        new(entry.Id, entry.Action.ToString(), entry.Sequence, entry.PostedVoucherId, entry.ReversedVoucherId, entry.ReversalVoucherId);

    private static DateTime ToUtc(DateOnly date) => date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);

    private static CustomException Conflict(string message) =>
        new(message, (IEnumerable<string>?)null, HttpStatusCode.Conflict);

    [LoggerMessage(Level = LogLevel.Information,
        Message = "Opening balances {Action} for branch {BranchId} (version {Sequence}); posted {PostedVoucherId}, reversed {ReversedVoucherId}")]
    private static partial void LogOpeningBalanceChanged(
        ILogger logger, OpeningBalanceAction action, Guid branchId, int sequence, Guid? postedVoucherId, Guid? reversedVoucherId);
}
