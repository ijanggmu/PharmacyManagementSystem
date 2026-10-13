using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.PaymentAccounts;

/// <summary>One method's new target. A null <paramref name="AccountId"/> resets the method to its built-in default.</summary>
public sealed record PaymentMethodAccountInput(string Method, Guid? AccountId);

/// <summary>Points each listed method at an account (methods not listed keep their mapping). The target must
/// be an active leaf cash/bank (10xx) asset account — insurance may use any active leaf asset account.
/// Returns the full mapping after the change.</summary>
public sealed record UpdatePaymentMethodAccountsCommand(IReadOnlyList<PaymentMethodAccountInput> Mappings)
    : ICommand<IReadOnlyList<PaymentMethodAccountDto>>;
