using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Medicines.FindSimilarMedicineNames;

/// <summary>
/// LASA (look-alike-sound-alike) check ported 1:1 from `findSimilarMedicineNames`
/// (lib/server/services/medicine-service.ts): needle shorter than 3 chars short-circuits to no
/// matches; compares against up to 500 tenant medicines; threshold is 1 for a 5-char-or-shorter
/// name, else 2; keeps distance > 0 (excludes an exact match) up to the threshold, sorted by
/// distance, top 5. The source Dto also carries `strength`/`form` — this .NET port's
/// <c>Medicine</c> aggregate has no such fields yet, so <see cref="SimilarMedicineNameDto"/>
/// carries <c>GenericName</c> instead.
/// </summary>
public sealed class FindSimilarMedicineNamesQueryHandler(InventoryDbContext dbContext)
    : IQueryHandler<FindSimilarMedicineNamesQuery, List<SimilarMedicineNameDto>>
{
    public async ValueTask<List<SimilarMedicineNameDto>> Handle(
        FindSimilarMedicineNamesQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        string needle = query.Name.Trim().ToUpperInvariant();
        if (needle.Length < 3)
        {
            return [];
        }

        var candidates = dbContext.Medicines.AsNoTracking();
        if (query.ExcludeId is { } excludeId)
        {
            candidates = candidates.Where(m => m.Id != excludeId);
        }

        var medicines = await candidates
            .Select(m => new { m.Id, m.Name, m.GenericName })
            .Take(500)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        int threshold = needle.Length <= 5 ? 1 : 2;

        return medicines
            .Select(m => new
            {
                m.Id,
                m.Name,
                m.GenericName,
                Distance = LevenshteinDistanceCalculator.Distance(needle, m.Name.Trim().ToUpperInvariant()),
            })
            .Where(m => m.Distance > 0 && m.Distance <= threshold)
            .OrderBy(m => m.Distance)
            .Take(5)
            .Select(m => new SimilarMedicineNameDto(m.Id, m.Name, m.GenericName, m.Distance))
            .ToList();
    }
}
