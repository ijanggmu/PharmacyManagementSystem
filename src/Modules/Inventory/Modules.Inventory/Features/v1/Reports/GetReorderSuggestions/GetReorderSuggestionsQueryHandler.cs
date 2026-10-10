using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Reports.GetReorderSuggestions;

public sealed class GetReorderSuggestionsQueryHandler(InventoryDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetReorderSuggestionsQuery, IReadOnlyList<ReorderSuggestionDto>>
{
    public async ValueTask<IReadOnlyList<ReorderSuggestionDto>> Handle(GetReorderSuggestionsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        // Same branch rule as the other stock reports: a selected (or pinned) branch is compared on its own
        // on-hand; all branches combined otherwise.
        Guid? branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        var suggestions = await (
            from m in dbContext.Medicines.AsNoTracking()
            let totalOnHand = dbContext.MedicineBatches
                .Where(b => b.MedicineId == m.Id && !b.IsDisposed && (branchId == null || b.BranchId == branchId))
                .Sum(b => (decimal?)b.QuantityOnHand) ?? 0m
            where totalOnHand <= m.ReorderLevel
            orderby totalOnHand
            select new ReorderSuggestionDto(
                m.Id, m.Name, m.ReorderLevel, totalOnHand,
                // Suggest topping back up to double the reorder level — a simple, explainable default.
                (m.ReorderLevel * 2) - totalOnHand,
                branchId))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return suggestions;
    }
}
