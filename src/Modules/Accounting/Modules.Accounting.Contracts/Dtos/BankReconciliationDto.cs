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
    Guid? BranchId = null,
    // The cash/bank account reconciled; null on reconciliations made before it was selectable (Bank 1010).
    Guid? AccountId = null);
