namespace FSH.Modules.Accounting.Contracts.Dtos;

public sealed record BankDepositDto(
    Guid Id,
    DateTime DepositDateUtc,
    decimal Amount,
    string? Description,
    string RecordedBy,
    DateTime CreatedAtUtc,
    Guid BranchId = default,
    // The cash/bank account deposited into; null on deposits made before it was selectable (Bank 1010).
    Guid? AccountId = null);
