namespace FSH.Modules.Accounting.Contracts.Dtos;

/// <summary>
/// Cross-module KPI aggregate for the reports overview page. .NET port of the Next.js reference's
/// <c>getReportsOverviewData</c> (lib/server/services/reports-service.ts, backing
/// <c>GET /api/reports/overview</c>).
///
/// The Next.js version returns six raw row-sets (sales/inventory/revenue/topProducts/customers/
/// prescriptions) for a report-building UI to aggregate client-side. That duplicates aggregation logic
/// this backend already exposes as first-class queries (<c>Sales.GetSalesStatsQuery</c>,
/// <c>Inventory.GetStockValuationQuery</c>/<c>GetInventoryDiscrepancyReportQuery</c>,
/// <c>Prescriptions.GetPrescriptionStatsQuery</c>, and this module's own trial balance) — so this DTO
/// composes those existing aggregates into top-line KPIs instead of re-deriving the same numbers a
/// second way from raw rows. Fields are flattened (not nested other-module DTOs) so this Contracts
/// project does not need a project reference to another module's Contracts project — only this
/// module's runtime project does, to call those queries via <c>IMediator</c>.
///
/// Per-row tables (sales list, medicine list, customer list, prescription list) are intentionally NOT
/// duplicated here: callers needing those already have <c>Sales.SearchSalesQuery</c>,
/// <c>Inventory.SearchMedicinesQuery</c>, <c>Customers.SearchCustomersQuery</c>, and
/// <c>Prescriptions.SearchPrescriptionsQuery</c> for that.
/// </summary>
public sealed record ReportsOverviewDto(
    DateTime FromUtc,
    DateTime ToUtc,
    DateTime GeneratedAtUtc,
    int SaleCount,
    decimal TotalRevenue,
    decimal TotalDiscount,
    decimal AverageSaleAmount,
    decimal InventoryValuation,
    int TotalMedicines,
    int LowStockCount,
    int PrescriptionsTotal,
    int PrescriptionsPending,
    int PrescriptionsPartiallyFilled,
    int PrescriptionsFilled,
    int PrescriptionsCancelled,
    decimal TrialBalanceTotalDebit,
    decimal TrialBalanceTotalCredit);
