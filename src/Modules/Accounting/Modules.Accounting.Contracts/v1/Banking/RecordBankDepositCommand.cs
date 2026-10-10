using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Banking;

/// <summary>Moves cash into the bank — posts Dr Bank / Cr Cash immediately.</summary>
public sealed record RecordBankDepositCommand(DateTime DepositDateUtc, decimal Amount, string? Description = null) : ICommand<Guid>;
