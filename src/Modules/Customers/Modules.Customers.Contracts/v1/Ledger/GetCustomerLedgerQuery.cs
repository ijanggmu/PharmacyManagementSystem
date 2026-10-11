using FSH.Framework.Shared.Persistence;
using FSH.Modules.Customers.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Customers.Contracts.v1.Ledger;

public sealed record GetCustomerLedgerQuery(
    Guid CustomerId,
    int PageNumber = 1,
    int PageSize = 50,
    Guid? BranchId = null) : IQuery<PagedResponse<CustomerLedgerEntryDto>>;
