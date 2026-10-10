using FSH.Modules.Inventory.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Reports;

/// <summary>
/// Inventory discrepancy compliance report — medicines currently below their reorder level. .NET
/// port of the "inventory" report type of the Next.js reference's
/// <c>generateInventoryDiscrepancyComplianceReport</c> (lib/server/services/reports-service.ts, used
/// by <c>/api/reports/compliance?type=inventory</c>).
///
/// The source report also flagged "overstock" against a <c>maximum_stock</c> column. This module's
/// ported <c>Medicine</c> entity (architecture.md "read-queries over already-migrated tables") has no
/// maximum-stock field — only <c>ReorderLevel</c> — so overstock detection is intentionally omitted
/// rather than invented; see the DTO's remarks.
/// </summary>
public sealed record GetInventoryDiscrepancyReportQuery : IQuery<InventoryDiscrepancyReportDto>;
