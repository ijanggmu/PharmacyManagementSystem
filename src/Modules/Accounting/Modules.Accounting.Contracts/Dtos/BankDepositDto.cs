namespace FSH.Modules.Accounting.Contracts.Dtos;

public sealed record BankDepositDto(
    Guid Id,
    DateTime DepositDateUtc,
    decimal Amount,
    string? Description,
    string RecordedBy,
    DateTime CreatedAtUtc,
    Guid BranchId = default);
