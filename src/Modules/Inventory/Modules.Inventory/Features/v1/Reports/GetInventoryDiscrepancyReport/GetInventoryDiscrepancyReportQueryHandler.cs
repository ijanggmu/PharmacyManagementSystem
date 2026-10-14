using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Reports.GetInventoryDiscrepancyReport;

/// <summary>
/// .NET port of the "inventory" branch of the Next.js reference's
/// <c>generateInventoryDiscrepancyComplianceReport</c>. Overstock detection is intentionally omitted —
/// see <see cref="GetInventoryDiscrepancyReportQuery"/>'s remarks on the missing maximum-stock field.
/// Low stock is judged on SELLABLE stock (not expired, not recalled — <see cref="FefoBatchOrdering.IsSellable"/>)
/// in the branch scope the other stock reports use, so expired units on the shelf or another branch's stock never
/// hide a medicine that needs reordering.
/// </summary>
public sealed class GetInventoryDiscrepancyReportQueryHandler(
    InventoryDbContext dbContext, TimeProvider timeProvider, ICurrentBranch currentBranch)
    : IQueryHandler<GetInventoryDiscrepancyReportQuery, InventoryDiscrepancyReportDto>
{
    public async ValueTask<InventoryDiscrepancyReportDto> Handle(
        GetInventoryDiscrepancyReportQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);
        var today = NepalClock.Today(timeProvider);

        var medicines = await (
            from m in dbContext.Medicines.AsNoTracking()
            where !m.IsDeleted
            let onHand = dbContext.MedicineBatches
                .Where(b => b.MedicineId == m.Id && !b.IsDisposed && !b.IsRecalled && b.QuantityOnHand > 0
                    && b.ExpiryDate >= today && (branchId == null || b.BranchId == branchId))
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
