using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Vouchers;

/// <summary>Deletes a DRAFT manual journal voucher outright. A posted or voided voucher cannot be
/// deleted — it is immutable once posted (rule.md §9.1); the handler returns 409 Conflict for those.
/// A posted voucher that must be removed from the books is reversed, never deleted.</summary>
public sealed record DeleteVoucherCommand(Guid VoucherId) : ICommand<Guid>;
