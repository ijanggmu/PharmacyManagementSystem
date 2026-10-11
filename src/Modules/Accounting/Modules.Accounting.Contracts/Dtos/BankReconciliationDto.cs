namespace FSH.Modules.Accounting.Contracts.Dtos;

public sealed record BankReconciliationDto(
    Guid Id,
    DateTime AsOfUtc,
    decimal GlBalance,
    decimal StatementBalance,
    decimal Variance,
    string? Notes,
    string ReconciledBy,
    DateTime CreatedAtUtc,
    Guid? BranchId = null);
