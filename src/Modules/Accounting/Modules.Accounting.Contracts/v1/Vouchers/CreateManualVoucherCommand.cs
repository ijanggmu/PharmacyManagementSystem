using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Vouchers;

/// <summary>Creates a DRAFT manual journal voucher. Posting is a separate step (PostVoucherCommand).</summary>
public sealed record CreateManualVoucherCommand(
    DateTime VoucherDateUtc,
    string? Narration,
    IReadOnlyList<VoucherLineInput> Lines) : ICommand<Guid>;
