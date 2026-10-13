using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Banking;

/// <summary>Moves cash into a bank — posts Dr the target account / Cr Cash immediately. <paramref name="AccountId"/>
/// picks the cash/bank (10xx) account the money went into; omitted, it is the account the tenant maps the "bank"
/// payment method to (Bank 1010 by default). The cash side is the "cash" method's account (Cash 1000 by default).</summary>
public sealed record RecordBankDepositCommand(
    DateTime DepositDateUtc, decimal Amount, string? Description = null, Guid? AccountId = null) : ICommand<Guid>;
