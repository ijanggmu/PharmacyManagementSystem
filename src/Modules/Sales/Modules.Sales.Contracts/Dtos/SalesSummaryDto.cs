namespace FSH.Modules.Sales.Contracts.Dtos;

/// <summary>Mirrors the legacy <c>getSalesStatsForTenant</c> aggregate. Payment state is derived from
/// <c>BalanceDue</c>: a sale with no balance outstanding counts as completed, otherwise as pending.
/// Cancelled sales are excluded from every total, revenue, today and payment figure; <see cref="CancelledCount"/>
/// reports them separately.</summary>
public sealed record SalesSummaryDto(
    int Total,
    decimal TotalRevenue,
    int TodaySales,
    decimal TodayRevenue,
    int PendingPayments,
    int CompletedPayments,
    int CancelledCount = 0);
