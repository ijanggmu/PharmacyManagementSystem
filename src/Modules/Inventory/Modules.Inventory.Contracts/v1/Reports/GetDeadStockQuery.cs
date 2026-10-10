using FSH.Framework.Shared.Persistence;
using FSH.Modules.Inventory.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Reports;

/// <summary>
/// Medicines with in-stock quantity but no sale in <paramref name="SinceDays"/> (default 90) — flags
/// inventory that is tying up money and, if perishable, may expire unsold. .NET port of the Next.js
/// reference's <c>getDeadStockReport</c> (lib/server/services/reports-service.ts).
/// </summary>
public sealed record GetDeadStockQuery(int SinceDays = 90, int PageNumber = 1, int PageSize = 50, Guid? BranchId = null)
    : IQuery<PagedResponse<DeadStockRowDto>>;
