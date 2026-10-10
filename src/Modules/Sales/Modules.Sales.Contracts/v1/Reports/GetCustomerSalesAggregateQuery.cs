using FSH.Modules.Sales.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Reports;

/// <summary>
/// Per-customer sale count and total spend for completed sales in [FromUtc, ToUtc] with a known customer,
/// current-branch scoped (see ICurrentBranch). Customers with no sales in the window are absent.
/// Internal cross-module query — no HTTP endpoint of its own; consumed by Customers' top-spenders report.
/// </summary>
public sealed record GetCustomerSalesAggregateQuery(DateTime FromUtc, DateTime ToUtc, Guid? BranchId = null)
    : IQuery<IReadOnlyDictionary<Guid, CustomerSalesAggregateDto>>;
