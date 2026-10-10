using FSH.Modules.Suppliers.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Suppliers.Contracts.v1.Ledger;

public sealed record GetApAgingReportQuery(DateTime AsOfUtc, Guid? BranchId = null)
    : IQuery<IReadOnlyList<ApAgingReportLineDto>>;
