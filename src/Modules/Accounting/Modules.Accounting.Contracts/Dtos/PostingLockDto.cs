namespace FSH.Modules.Accounting.Contracts.Dtos;

public sealed record PostingLockDto(DateOnly? LockDate, DateTime? UpdatedAtUtc, string? UpdatedBy)
{
    /// <summary>The most recent lock-date changes, newest first (at most <see cref="MaxHistory"/>).</summary>
    public IReadOnlyList<PostingLockChangeDto> History { get; init; } = [];

    public const int MaxHistory = 20;
}

/// <summary>One posting-lock change: who moved the lock date from what to what, and when. A null date means
/// the books were open (no lock).</summary>
public sealed record PostingLockChangeDto(DateOnly? FromLockDate, DateOnly? ToLockDate, string ChangedBy, DateTime ChangedAtUtc);
