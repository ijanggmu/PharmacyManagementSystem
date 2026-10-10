using FSH.Framework.Shared.Persistence;
using FSH.Modules.Sales.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.CashShifts;

public sealed record SearchCashShiftsQuery(
    string? Status = null,
    Guid? BranchId = null,
    int PageNumber = 1,
    int PageSize = 50) : IQuery<PagedResponse<CashShiftDto>>;
