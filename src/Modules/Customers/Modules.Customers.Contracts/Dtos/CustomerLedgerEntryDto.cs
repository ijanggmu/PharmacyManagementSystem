namespace FSH.Modules.Customers.Contracts.Dtos;

public sealed record CustomerLedgerEntryDto(
    Guid Id,
    Guid CustomerId,
    DateTime EntryDateUtc,
    string EntryType,
    string? Description,
    decimal DebitAmount,
    decimal CreditAmount,
    decimal RunningBalance,
    string? ReferenceType,
    Guid? ReferenceId,
    DateTime CreatedAtUtc,
    Guid? BranchId,
    // Sale invoice number (INV-…) or payment receipt number (RCP-…).
    string? DocumentNumber = null);
