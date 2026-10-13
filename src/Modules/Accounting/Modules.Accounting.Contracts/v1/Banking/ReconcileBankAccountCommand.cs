using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Banking;

/// <summary>Compares a cash/bank account's GL balance with a statement balance. <paramref name="AccountId"/> picks
/// the account (any cash/bank 10xx asset account); omitted, it is Bank (1010).</summary>
public sealed record ReconcileBankAccountCommand(
    DateTime AsOfUtc, decimal StatementBalance, string? Notes = null, Guid? AccountId = null) : ICommand<Guid>;
