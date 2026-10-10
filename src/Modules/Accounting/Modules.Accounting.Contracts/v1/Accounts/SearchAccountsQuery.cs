using FSH.Framework.Shared.Persistence;
using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Accounts;

public sealed record SearchAccountsQuery(
    string? Search = null,
    string? AccountType = null,
    bool? IsActive = null,
    int PageNumber = 1,
    int PageSize = 50,
    bool PostableOnly = false) : IQuery<PagedResponse<AccountingAccountDto>>;
