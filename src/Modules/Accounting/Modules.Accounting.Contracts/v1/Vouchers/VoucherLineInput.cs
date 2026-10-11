namespace FSH.Modules.Accounting.Contracts.v1.Vouchers;

public sealed record VoucherLineInput(Guid AccountId, string? Description, decimal DebitAmount, decimal CreditAmount);
