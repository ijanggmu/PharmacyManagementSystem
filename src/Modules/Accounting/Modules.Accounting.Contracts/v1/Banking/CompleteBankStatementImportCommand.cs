using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Banking;

/// <summary>Finalizes a reconciliation. Rejected unless every statement line is matched/ignored
/// AND every posted GL line on the account for the period is claimed by some statement line.</summary>
public sealed record CompleteBankStatementImportCommand(Guid ImportId) : ICommand<Guid>;
