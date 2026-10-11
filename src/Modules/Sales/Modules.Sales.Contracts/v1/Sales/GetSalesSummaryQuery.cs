using FSH.Modules.Sales.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Sales;

/// <summary>
/// Legacy-shaped sales summary for the current branch. <c>TodayStartUtc</c> is the start of "today"
/// in the caller's timezone expressed in UTC; when omitted, the UTC day start is used.
/// </summary>
public sealed record GetSalesSummaryQuery(DateTime? TodayStartUtc) : IQuery<SalesSummaryDto>;
