using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.PaymentAccounts;

/// <summary>The tenant's payment-method → money-account mapping, one row per method (cash, card, bank,
/// cheque, esewa, khalti, fonepay, insurance, other), defaults included.</summary>
public sealed record GetPaymentMethodAccountsQuery : IQuery<IReadOnlyList<PaymentMethodAccountDto>>;
