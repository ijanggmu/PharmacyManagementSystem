namespace FSH.Modules.Accounting.Contracts.Dtos;

public sealed record PostingLockDto(DateOnly? LockDate, DateTime? UpdatedAtUtc, string? UpdatedBy);
