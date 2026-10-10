using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Banking;

/// <summary>Auto-matches unmatched statement lines against unclaimed posted GL lines on the same
/// account/period by exact amount + direction within a date tolerance. Ambiguous candidates are
/// left for a human. See <c>BankStatementAutoMatcher</c>.</summary>
public sealed record AutoMatchBankStatementImportCommand(Guid ImportId) : ICommand<AutoMatchResultDto>;
