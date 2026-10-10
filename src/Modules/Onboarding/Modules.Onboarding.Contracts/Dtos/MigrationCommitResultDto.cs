namespace FSH.Modules.Onboarding.Contracts.Dtos;

public sealed record MigrationCommitResultDto(
    Guid SessionId,
    Guid? BankVoucherId,
    Guid? CashVoucherId,
    Guid? CustomerVoucherId,
    Guid? SupplierVoucherId,
    Guid? StockVoucherId,
    decimal TotalOpeningValuePosted);
