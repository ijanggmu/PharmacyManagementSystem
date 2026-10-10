using System.Text.Json;
using FSH.Framework.Core.Domain;

namespace FSH.Modules.Accounting.Domain;

/// <summary>
/// Append-only audit row for one Set / Edit / Reset of a branch's opening balances. The latest entry
/// per branch (highest <see cref="Sequence"/>) is the current state: after Set/Edit,
/// <see cref="PostedVoucherId"/> is the active opening voucher and the entries are its figures; after
/// Reset nothing is active. <see cref="Sequence"/> is unique per (tenant, branch), so two concurrent
/// changes can't both commit. The id is the client's request key, so a retried request finds the
/// entry it already wrote instead of posting again.
/// </summary>
public sealed class OpeningBalanceHistoryEntry : AggregateRoot<Guid>
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public Guid BranchId { get; private set; }
    public int Sequence { get; private set; }
    public OpeningBalanceAction Action { get; private set; }

    /// <summary>Opening date of the balances after this change; null after a Reset.</summary>
    public DateOnly? OpeningDate { get; private set; }

    /// <summary>Opening date of the balances this change replaced (Edit/Reset).</summary>
    public DateOnly? PreviousOpeningDate { get; private set; }

    public Guid? PostedVoucherId { get; private set; }
    public Guid? ReversedVoucherId { get; private set; }
    public Guid? ReversalVoucherId { get; private set; }

    /// <summary>Σ entered debits / credits after this change (0 after a Reset).</summary>
    public decimal TotalDebit { get; private set; }
    public decimal TotalCredit { get; private set; }

    /// <summary>The Owner's Equity line posted to balance the voucher.</summary>
    public decimal EquityAdjustmentDebit { get; private set; }
    public decimal EquityAdjustmentCredit { get; private set; }

    /// <summary>JSON snapshot of the entered balances after this change.</summary>
    public string EntriesJson { get; private set; } = "[]";

    /// <summary>JSON list of per-account before → after amounts.</summary>
    public string ChangesJson { get; private set; } = "[]";

    public string? Reason { get; private set; }
    public Guid PerformedByUserId { get; private set; }
    public string PerformedByName { get; private set; } = default!;
    public DateTime PerformedAtUtc { get; private set; }

    private OpeningBalanceHistoryEntry() { }

    /// <summary>True when, after this change, an opening voucher is active (Set/Edit).</summary>
    public bool LeavesActiveOpening => Action != OpeningBalanceAction.Reset;

    public static OpeningBalanceHistoryEntry Record(
        Guid id,
        Guid branchId,
        int sequence,
        OpeningBalanceAction action,
        DateOnly? openingDate,
        DateOnly? previousOpeningDate,
        Guid? postedVoucherId,
        Guid? reversedVoucherId,
        Guid? reversalVoucherId,
        IReadOnlyCollection<OpeningBalanceEntry> entries,
        IReadOnlyCollection<OpeningBalanceChange> changes,
        string? reason,
        Guid performedByUserId,
        string performedByName)
    {
        ArgumentNullException.ThrowIfNull(entries);
        ArgumentNullException.ThrowIfNull(changes);
        ArgumentException.ThrowIfNullOrWhiteSpace(performedByName);
        if (id == Guid.Empty)
        {
            throw new ArgumentException("Request id is required.", nameof(id));
        }

        if (sequence < 1)
        {
            throw new ArgumentOutOfRangeException(nameof(sequence), sequence, "Sequence starts at 1.");
        }

        bool posts = action != OpeningBalanceAction.Reset;
        if (posts && (postedVoucherId is null || openingDate is null))
        {
            throw new ArgumentException("Set and Edit must record the posted voucher and opening date.", nameof(postedVoucherId));
        }

        if (action != OpeningBalanceAction.Set && (reversedVoucherId is null || reversalVoucherId is null))
        {
            throw new ArgumentException("Edit and Reset must record the reversed voucher and its reversal.", nameof(reversedVoucherId));
        }

        if (action != OpeningBalanceAction.Set && string.IsNullOrWhiteSpace(reason))
        {
            throw new ArgumentException("Edit and Reset require a reason.", nameof(reason));
        }

        var (debit, credit) = OpeningBalanceRules.Totals(entries);
        var (adjDebit, adjCredit) = OpeningBalanceRules.EquityAdjustment(entries);

        return new OpeningBalanceHistoryEntry
        {
            Id = id,
            BranchId = branchId,
            Sequence = sequence,
            Action = action,
            OpeningDate = posts ? openingDate : null,
            PreviousOpeningDate = previousOpeningDate,
            PostedVoucherId = posts ? postedVoucherId : null,
            ReversedVoucherId = reversedVoucherId,
            ReversalVoucherId = reversalVoucherId,
            TotalDebit = debit,
            TotalCredit = credit,
            EquityAdjustmentDebit = adjDebit,
            EquityAdjustmentCredit = adjCredit,
            EntriesJson = JsonSerializer.Serialize(entries, JsonOptions),
            ChangesJson = JsonSerializer.Serialize(changes, JsonOptions),
            Reason = string.IsNullOrWhiteSpace(reason) ? null : reason.Trim(),
            PerformedByUserId = performedByUserId,
            PerformedByName = performedByName.Trim(),
            PerformedAtUtc = DateTime.UtcNow,
        };
    }

    public IReadOnlyList<OpeningBalanceEntry> ReadEntries() =>
        JsonSerializer.Deserialize<List<OpeningBalanceEntry>>(EntriesJson, JsonOptions) ?? [];

    public IReadOnlyList<OpeningBalanceChange> ReadChanges() =>
        JsonSerializer.Deserialize<List<OpeningBalanceChange>>(ChangesJson, JsonOptions) ?? [];
}
