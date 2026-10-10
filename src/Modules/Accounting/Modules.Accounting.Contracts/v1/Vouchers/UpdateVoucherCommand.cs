using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Vouchers;

/// <summary>Replaces the date, narration and lines of a DRAFT manual journal voucher. A posted or
/// voided voucher cannot be edited — it is immutable once posted (rule.md §9.1); the handler returns
/// 409 Conflict for those.</summary>
public sealed record UpdateVoucherCommand(
    Guid VoucherId,
    DateTime VoucherDateUtc,
    string? Narration,
    IReadOnlyList<VoucherLineInput> Lines) : ICommand<Guid>;
