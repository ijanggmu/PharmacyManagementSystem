using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Inventory.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Reports.GetInventoryDiscrepancyReport;

/// <summary>
/// .NET port of the "inventory" branch of the Next.js reference's
/// <c>generateInventoryDiscrepancyComplianceReport</c>. Overstock detection is intentionally omitted —
/// see <see cref="GetInventoryDiscrepancyReportQuery"/>'s remarks on the missing maximum-stock field.
/// </summary>
public sealed class GetInventoryDiscrepancyReportQueryHandler(InventoryDbContext dbContext, TimeProvider timeProvider)
    : IQueryHandler<GetInventoryDiscrepancyReportQuery, InventoryDiscrepancyReportDto>
{
    public async ValueTask<InventoryDiscrepancyReportDto> Handle(
        GetInventoryDiscrepancyReportQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var medicines = await (
            from m in dbContext.Medicines.AsNoTracking()
            where !m.IsDeleted
            let onHand = dbContext.MedicineBatches
                .Where(b => b.MedicineId == m.Id && !b.IsDisposed)
                .Sum(b => (decimal?)b.QuantityOnHand) ?? 0m
            select new { m.Id, m.Name, m.ReorderLevel, OnHand = onHand })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var lowStock = medicines
            .Where(m => m.OnHand < m.ReorderLevel)
            .Select(m => new InventoryDiscrepancyEntryDto(m.Id, m.Name, m.OnHand, m.ReorderLevel))
            .OrderBy(m => m.CurrentStock)
            .ToList();

        return new InventoryDiscrepancyReportDto(
            timeProvider.GetUtcNow().UtcDateTime,
            medicines.Count,
            lowStock.Count,
            lowStock);
    }
}
