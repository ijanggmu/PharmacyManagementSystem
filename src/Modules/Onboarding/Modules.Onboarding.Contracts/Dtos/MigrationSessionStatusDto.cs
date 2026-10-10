namespace FSH.Modules.Onboarding.Contracts.Dtos;

public sealed record MigrationCategorySummaryDto(string Category, int LineCount, decimal TotalAmount);

public sealed record MigrationSessionStatusDto(
    Guid Id,
    DateOnly CutoverDate,
    string? Notes,
    string Status,
    DateTime CreatedAtUtc,
    DateTime? CommittedAtUtc,
    string? CommittedBy,
    IReadOnlyList<MigrationCategorySummaryDto> Categories,
    Guid? BankVoucherId,
    Guid? CashVoucherId,
    Guid? CustomerVoucherId,
    Guid? SupplierVoucherId,
    Guid? StockVoucherId);
