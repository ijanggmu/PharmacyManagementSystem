namespace FSH.Modules.Accounting.Contracts.Dtos;

/// <summary>
/// A chart-of-accounts row with its place in the tree. <c>ParentId</c> is null only for the five root
/// heads (<c>IsRootHead</c>). <c>HasChildren</c> marks group accounts — they roll up their sub-accounts and
/// never take voucher lines. <c>HasPostings</c> is true when any voucher line (draft or posted) references the
/// account; such an account can't become a group.
/// </summary>
public sealed record AccountingAccountDto(
    Guid Id,
    string Code,
    string Name,
    string AccountType,
    bool IsSystem,
    bool IsActive,
    DateTime CreatedAtUtc,
    DateTime? UpdatedAtUtc,
    Guid? ParentId = null,
    bool HasChildren = false,
    bool HasPostings = false,
    bool IsRootHead = false);
