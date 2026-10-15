using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Reports.GetReorderSuggestions;

/// <summary>Medicines at or below their reorder level, with how much to order by <see cref="ReorderQuantity"/> — the
/// same rule Purchasing's reorder suggestions use. Medicines with nothing to order (no reorder level, no maximum) are
/// left out.</summary>
public sealed class GetReorderSuggestionsQueryHandler(InventoryDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetReorderSuggestionsQuery, IReadOnlyList<ReorderSuggestionDto>>
{
    public async ValueTask<IReadOnlyList<ReorderSuggestionDto>> Handle(GetReorderSuggestionsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        // Same branch rule as the other stock reports: a selected (or pinned) branch is compared on its own
        // on-hand; all branches combined otherwise.
        Guid? branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        // Only sellable stock counts towards the reorder level: expired or recalled units sitting on the
        // shelf cannot be sold, so they must not keep a medicine off the reorder list.
        var today = NepalClock.Today();

        var rows = await (
            from m in dbContext.Medicines.AsNoTracking()
            let totalOnHand = dbContext.MedicineBatches
                .Where(b => b.MedicineId == m.Id && !b.IsDisposed && !b.IsRecalled && b.QuantityOnHand > 0 && b.ExpiryDate >= today
                    && (branchId == null || b.BranchId == branchId))
                .Sum(b => (decimal?)b.QuantityOnHand) ?? 0m
            where totalOnHand <= m.ReorderLevel
            orderby totalOnHand
            select new { m.Id, m.Name, m.ReorderLevel, m.MaximumStock, m.UnitsPerPack, OnHand = totalOnHand })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return rows
            .Select(r => new ReorderSuggestionDto(
                r.Id, r.Name, r.ReorderLevel, r.OnHand,
                ReorderQuantity.Suggest(r.ReorderLevel, r.MaximumStock, r.OnHand, r.UnitsPerPack),
                branchId))
            .Where(s => s.SuggestedOrderQuantity > 0m)
            .ToList();
    }
}
