using FSH.Framework.Persistence;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Medicines.SearchMedicines;

/// <summary>
/// Paged medicine list. Stock and expiry filters depend on batch aggregates, so when either is
/// requested (or <c>BelowReorderLevel</c>) the candidate set is materialised (capped, as the legacy
/// route did) and filtered in memory before paging; otherwise paging runs in SQL.
/// </summary>
public sealed class SearchMedicinesQueryHandler(
    InventoryDbContext dbContext,
    TimeProvider timeProvider,
    ICurrentBranch currentBranch)
    : IQueryHandler<SearchMedicinesQuery, PagedResponse<MedicineDto>>
{
    private const int InMemoryCap = 3000;

    public async ValueTask<PagedResponse<MedicineDto>> Handle(SearchMedicinesQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 50 : query.PageSize;

        var today = DateOnly.FromDateTime(timeProvider.GetUtcNow().UtcDateTime);
        var soon = today.AddDays(30);
        // Stock scope: a selected branch (or the caller's own, when confined) drives on-hand totals, the
        // stock/expiry filters, quantity/expiry sorting and FEFO picks; null = all branches combined.
        Guid? stockScope = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);
        // The per-branch figure shown next to the total: the scoped branch, else the current branch.
        Guid? branchId = stockScope ?? await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);

        IQueryable<Medicine> medicines = dbContext.Medicines.AsNoTracking();
        if (query.IncludeArchived)
        {
            medicines = medicines.IgnoreQueryFilters([QueryFilters.SoftDelete]);
        }

        Guid[]? categoryIds = null;
        if (query.CategoryIds is { Count: > 0 })
        {
            categoryIds = query.CategoryIds.ToArray();
        }
        else if (query.CategoryId is { } single)
        {
            categoryIds = [single];
        }
        if (categoryIds is not null)
        {
            medicines = medicines.Where(m => m.CategoryId != null && categoryIds.Contains(m.CategoryId.Value));
        }

        if (query.SupplierId is { } supplierId)
        {
            medicines = medicines.Where(m => m.SupplierId == supplierId);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            string term = query.Search.Trim();
            medicines = medicines.Where(m =>
                EF.Functions.ILike(m.Name, $"%{term}%") ||
                (m.GenericName != null && EF.Functions.ILike(m.GenericName, $"%{term}%")) ||
                (m.BrandName != null && EF.Functions.ILike(m.BrandName, $"%{term}%")) ||
                (m.Barcode != null && m.Barcode == term));
        }

        var stockStatuses = query.StockStatuses ?? [];
        var expiryStatuses = query.ExpiryStatuses ?? [];
        string sortBy = query.SortBy ?? "name";
        bool descending = string.Equals(query.SortOrder, "desc", StringComparison.OrdinalIgnoreCase);
        bool sortNeedsBatches = sortBy is "quantity" or "expiry";
        bool needsInMemory = stockStatuses.Count > 0 || expiryStatuses.Count > 0 || query.BelowReorderLevel == true || sortNeedsBatches;

        if (!needsInMemory)
        {
            var ordered = OrderInSql(medicines, sortBy, descending);
            long total = await ordered.LongCountAsync(cancellationToken).ConfigureAwait(false);
            var pageRows = await ordered
                .Skip((page - 1) * size)
                .Take(size)
                .ToListAsync(cancellationToken)
                .ConfigureAwait(false);

            var batches = await LoadBatchesAsync(pageRows.Select(m => m.Id).ToList(), stockScope, cancellationToken).ConfigureAwait(false);
            return new PagedResponse<MedicineDto>
            {
                Items = pageRows.Select(m => ToDto(m, batches, today, branchId)).ToList(),
                PageNumber = page,
                PageSize = size,
                TotalCount = total,
                TotalPages = (int)Math.Ceiling(total / (double)size),
            };
        }

        var candidates = await medicines
            .OrderBy(m => m.Name)
            .ThenBy(m => m.Id)
            .Take(InMemoryCap)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var allBatches = await LoadBatchesAsync(candidates.Select(m => m.Id).ToList(), stockScope, cancellationToken).ConfigureAwait(false);
        var aggregates = MedicineBatchAggregator.Aggregate(allBatches, today);

        var filtered = candidates.Where(m =>
        {
            decimal onHand = TotalOnHand(allBatches, m.Id);

            if (query.BelowReorderLevel == true && onHand > m.ReorderLevel) return false;
            if (stockStatuses.Count > 0 && !stockStatuses.Any(s => MatchesStock(onHand, m.ReorderLevel, s))) return false;
            if (expiryStatuses.Count > 0)
            {
                var nearest = aggregates.GetOrEmpty(m.Id).NearestExpiry;
                if (!expiryStatuses.Any(s => MatchesExpiry(nearest, s, today, soon))) return false;
            }
            return true;
        }).ToList();

        int count = filtered.Count;
        var sorted = SortInMemory(
            filtered, sortBy, descending,
            m => TotalOnHand(allBatches, m.Id),
            m => aggregates.GetOrEmpty(m.Id).NearestExpiry);
        var items = sorted
            .Skip((page - 1) * size)
            .Take(size)
            .Select(m => ToDto(m, allBatches, today, branchId))
            .ToList();

        return new PagedResponse<MedicineDto>
        {
            Items = items,
            PageNumber = page,
            PageSize = size,
            TotalCount = count,
            TotalPages = (int)Math.Ceiling(count / (double)size),
        };
    }

    private static IOrderedQueryable<Medicine> OrderInSql(IQueryable<Medicine> medicines, string sortBy, bool descending) => sortBy switch
    {
        "price" => descending
            ? medicines.OrderByDescending(m => m.UnitPrice).ThenBy(m => m.Id)
            : medicines.OrderBy(m => m.UnitPrice).ThenBy(m => m.Id),
        "updated" => descending
            ? medicines.OrderByDescending(m => m.UpdatedAtUtc).ThenBy(m => m.Id)
            : medicines.OrderBy(m => m.UpdatedAtUtc).ThenBy(m => m.Id),
        _ => descending
            ? medicines.OrderByDescending(m => m.Name).ThenBy(m => m.Id)
            : medicines.OrderBy(m => m.Name).ThenBy(m => m.Id),
    };

    private static IEnumerable<Medicine> SortInMemory(
        IEnumerable<Medicine> items, string sortBy, bool descending,
        Func<Medicine, decimal> onHand, Func<Medicine, DateOnly?> nearestExpiry) => sortBy switch
    {
        "quantity" => descending
            ? items.OrderByDescending(onHand).ThenBy(m => m.Name).ThenBy(m => m.Id)
            : items.OrderBy(onHand).ThenBy(m => m.Name).ThenBy(m => m.Id),
        "expiry" => descending
            ? items.OrderBy(m => nearestExpiry(m) is null).ThenByDescending(nearestExpiry).ThenBy(m => m.Name).ThenBy(m => m.Id)
            : items.OrderBy(m => nearestExpiry(m) is null).ThenBy(nearestExpiry).ThenBy(m => m.Name).ThenBy(m => m.Id),
        "price" => descending
            ? items.OrderByDescending(m => m.UnitPrice).ThenBy(m => m.Name).ThenBy(m => m.Id)
            : items.OrderBy(m => m.UnitPrice).ThenBy(m => m.Name).ThenBy(m => m.Id),
        "updated" => descending
            ? items.OrderByDescending(m => m.UpdatedAtUtc).ThenBy(m => m.Name).ThenBy(m => m.Id)
            : items.OrderBy(m => m.UpdatedAtUtc).ThenBy(m => m.Name).ThenBy(m => m.Id),
        _ => descending
            ? items.OrderByDescending(m => m.Name).ThenBy(m => m.Id)
            : items.OrderBy(m => m.Name).ThenBy(m => m.Id),
    };

    private async Task<List<MedicineBatch>> LoadBatchesAsync(IReadOnlyList<Guid> medicineIds, Guid? branchScope, CancellationToken cancellationToken)
    {
        return await dbContext.MedicineBatches
            .AsNoTracking()
            .Where(b => medicineIds.Contains(b.MedicineId) && (branchScope == null || b.BranchId == branchScope))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
    }

    private static decimal TotalOnHand(IEnumerable<MedicineBatch> batches, Guid medicineId) =>
        batches.Where(b => b.MedicineId == medicineId && !b.IsDisposed).Sum(b => b.QuantityOnHand);

    private static bool MatchesStock(decimal onHand, decimal reorderLevel, string status) => status switch
    {
        "out" => onHand == 0,
        "low" => onHand <= reorderLevel && onHand > 0,
        _ => onHand > reorderLevel,
    };

    private static bool MatchesExpiry(DateOnly? expiry, string status, DateOnly today, DateOnly soon)
    {
        if (expiry is not { } e) return false;
        return status == "expired" ? e < today : e >= today && e <= soon;
    }

    private static MedicineDto ToDto(Medicine m, IReadOnlyList<MedicineBatch> batches, DateOnly today, Guid? branchId)
    {
        var agg = MedicineBatchAggregator.Aggregate(batches.Where(b => b.MedicineId == m.Id), today).GetOrEmpty(m.Id);
        decimal? branchOnHand = branchId is { } bid
            ? batches.Where(b => b.MedicineId == m.Id && b.BranchId == bid && !b.IsDisposed).Sum(b => b.QuantityOnHand)
            : null;

        return new MedicineDto(
            m.Id, m.Name, m.GenericName, m.CategoryId, m.ReorderLevel, m.IsControlled,
            TotalOnHand(batches, m.Id), m.IsDeleted, m.CreatedAtUtc, m.UpdatedAtUtc, m.DeletedOnUtc, m.DeletedBy,
            agg.NearestExpiry, agg.Count, agg.RackLocations, agg.FefoPicks,
            m.UnitPrice, m.CostPrice, m.Form, m.Strength,
            m.SupplierId, m.Barcode, m.Description, m.MaximumStock, m.PrescriptionRequired,
            m.BrandName, m.Dosage, m.SideEffects, m.StorageInstructions,
            m.StorageTempMinC, m.StorageTempMaxC, m.RequiresColdChain,
            m.UnitsPerPack, m.UnitLabel, m.IsTaxable,
            m.SupplierInvoiceNumber, m.VatAmount,
            branchOnHand,
            m.ControlledSchedule);
    }
}
