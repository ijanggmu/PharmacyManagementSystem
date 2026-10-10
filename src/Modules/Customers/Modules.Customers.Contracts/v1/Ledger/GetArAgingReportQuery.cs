using FSH.Modules.Customers.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Customers.Contracts.v1.Ledger;

public sealed record GetArAgingReportQuery(DateTime AsOfUtc, Guid? BranchId = null)
    : IQuery<IReadOnlyList<ArAgingReportLineDto>>;
