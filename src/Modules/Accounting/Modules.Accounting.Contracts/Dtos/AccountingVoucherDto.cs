namespace FSH.Modules.Accounting.Contracts.Dtos;

public sealed record AccountingVoucherLineDto(
    int LineNo,
    Guid AccountId,
    string? AccountCode,
    string? AccountName,
    string? Description,
    decimal DebitAmount,
    decimal CreditAmount);

/// <summary>A voucher. <see cref="ReversesVoucherId"/>/<see cref="ReversesVoucherNo"/> are set on a reversing
/// voucher (it reverses that one); <see cref="ReversedByVoucherId"/>/<see cref="ReversedByVoucherNo"/> are set on
/// a reversed original (the reversing voucher — the posted one when there are several).</summary>
public sealed record AccountingVoucherDto(
    Guid Id,
    string VoucherNo,
    DateTime VoucherDateUtc,
    string VoucherType,
    string Source,
    string? ReferenceType,
    Guid? ReferenceId,
    string Status,
    string? Narration,
    DateTime CreatedAtUtc,
    DateTime? PostedAtUtc,
    string? PostedBy,
    string? VoidReason,
    IReadOnlyList<AccountingVoucherLineDto> Lines,
    Guid? BranchId = null,
    decimal TotalDebit = 0m,
    decimal TotalCredit = 0m,
    int LineCount = 0,
    Guid? ReversesVoucherId = null,
    string? ReversesVoucherNo = null,
    Guid? ReversedByVoucherId = null,
    string? ReversedByVoucherNo = null);
