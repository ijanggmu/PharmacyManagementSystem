using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Banking;

/// <summary>Manually pairs one statement line with one posted GL voucher line on the same
/// account. Rejected if the line is already matched, the amounts differ, or the GL line already
/// belongs to another statement line.</summary>
public sealed record MatchBankStatementLineCommand(Guid LineId, Guid VoucherLineId) : ICommand<Guid>;
