using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Accounts;

public sealed record GetAccountByIdQuery(Guid AccountId) : IQuery<AccountingAccountDto>;
