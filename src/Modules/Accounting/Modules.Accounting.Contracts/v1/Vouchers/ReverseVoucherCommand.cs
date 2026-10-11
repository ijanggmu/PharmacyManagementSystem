using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Vouchers;

/// <summary>Reverses a posted voucher: posts a new, fully offsetting voucher and voids the
/// original. Returns the id of the new reversing voucher.</summary>
public sealed record ReverseVoucherCommand(Guid VoucherId, DateTime? ReversalDateUtc = null) : ICommand<Guid>;
