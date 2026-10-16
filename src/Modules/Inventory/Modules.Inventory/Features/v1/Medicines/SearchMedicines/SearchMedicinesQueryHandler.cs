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
/// Paged medicine list. Every filter, sort and page runs in SQL: the per-medicine stock figures the
/// stock/expiry filters and the quantity/expiry sorts need are correlated sub-queries over the
/// branch-scoped lots, so the total count is exact however many medicines the tenant has (the old
/// in-memory path capped the candidates at 3000 before filtering).
///
/// "In stock" means sellable stock — lots not disposed, not recalled and not expired as of today's
/// Nepal date — so an expired or recalled lot never makes a medicine look stocked (or keeps it off the
/// low-stock list). The physical total (every live lot) is still returned as the on-hand figure.
/// </summary>
public sealed class SearchMedicinesQueryHandler(
    InventoryDbContext dbContext,
    TimeProvider timeProvider,
    ICurrentBranch currentBranch)
    : IQueryHandler<SearchMedicinesQuery, PagedResponse<MedicineDto>>
{
    public async ValueTask<PagedResponse<MedicineDto>> Handle(SearchMedicinesQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 50 : query.PageSize;

        var today = NepalClock.Today(timeProvider);
        var soon = today.AddDays(30);
        // Stock scope: a selected branch (or the caller's own, when confined) drives on-hand totals, the
        // stock/expiry filters, quantity/expiry sorting and FEFO picks; null = all branches combined.
        Guid? stockScope = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);
        // The per-branch figure shown next to the total: the scoped branch, else the current branch.
        Guid? branchId = stockScope ?? await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);

        var rows = Filter(ProjectStock(ApplyMedicineFilters(query), stockScope, today), query, today, soon);

        long total = await rows.LongCountAsync(cancellationToken).ConfigureAwait(false);
        var pageRows = await Order(rows, query.SortBy ?? "name", string.Equals(query.SortOrder, "desc", StringComparison.OrdinalIgnoreCase))
            .Skip((page - 1) * size)
            .Take(size)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        // The page's medicines and lot details (FEFO picks, racks, branch figures) — this page only.
        var medicineIds = pageRows.Select(r => r.Id).ToList();
        var medicines = await ApplyMedicineFilters(query)
            .Where(m => medicineIds.Contains(m.Id))
            .ToDictionaryAsync(m => m.Id, cancellationToken)
            .ConfigureAwait(false);
        var batches = await dbContext.MedicineBatches
            .AsNoTracking()
            .Where(b => medicineIds.Contains(b.MedicineId) && (stockScope == null || b.BranchId == stockScope || b.BranchId == branchId))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        var latestPrices = await LatestLotPrices.LoadAsync(dbContext, medicineIds, cancellationToken).ConfigureAwait(false);

        return new PagedResponse<MedicineDto>
        {
            Items = pageRows
                .Where(r => medicines.ContainsKey(r.Id))
                .Select(r =>
                {
                    var dto = ToDto(medicines[r.Id], batches, stockScope, today, branchId);
                    return latestPrices.TryGetValue(r.Id, out var latest)
                        ? dto with { LatestCostPrice = latest.CostPrice, LatestSellingPrice = latest.SellingPrice }
                        : dto;
                })
                .ToList(),
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size),
        };
    }

    /// <summary>A medicine's sort keys with the stock figures its filters and sorts need, computed in
    /// SQL. Scalars only, so every filter and ORDER BY composes cleanly on top of the projection.</summary>
    private sealed class MedicineStockRow
    {
        public Guid Id { get; init; }

        public string Name { get; init; } = default!;

        public decimal ReorderLevel { get; init; }

        public decimal UnitPrice { get; init; }

        public DateTime? UpdatedAtUtc { get; init; }

        /// <summary>Sellable units in scope: not disposed, not recalled, not expired.</summary>
        public decimal Sellable { get; init; }

        /// <summary>Nearest expiry among lots still holding stock (not disposed, not recalled) — what
        /// the expiry filters and sort key off, expired lots included.</summary>
        public DateOnly? NearestExpiry { get; init; }
    }

    private IQueryable<Medicine> ApplyMedicineFilters(SearchMedicinesQuery query)
    {
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

        return medicines;
    }

    private IQueryable<MedicineStockRow> ProjectStock(IQueryable<Medicine> medicines, Guid? stockScope, DateOnly today)
    {
        var lots = dbContext.MedicineBatches.AsNoTracking()
            .Where(b => !b.IsDisposed && !b.IsRecalled && b.QuantityOnHand > 0 && (stockScope == null || b.BranchId == stockScope));

        return medicines.Select(m => new MedicineStockRow
        {
            Id = m.Id,
            Name = m.Name,
            ReorderLevel = m.ReorderLevel,
            UnitPrice = m.UnitPrice,
            UpdatedAtUtc = m.UpdatedAtUtc,
            Sellable = lots.Where(b => b.MedicineId == m.Id && b.ExpiryDate >= today).Sum(b => (decimal?)b.QuantityOnHand) ?? 0m,
            NearestExpiry = lots.Where(b => b.MedicineId == m.Id).Min(b => (DateOnly?)b.ExpiryDate),
        });
    }

    private static IQueryable<MedicineStockRow> Filter(
        IQueryable<MedicineStockRow> rows, SearchMedicinesQuery query, DateOnly today, DateOnly soon)
    {
        if (query.BelowReorderLevel == true)
        {
            rows = rows.Where(r => r.Sellable <= r.ReorderLevel);
        }

        var stockStatuses = query.StockStatuses ?? [];
        if (stockStatuses.Count > 0)
        {
            bool wantOut = stockStatuses.Contains("out");
            bool wantLow = stockStatuses.Contains("low");
            bool wantIn = stockStatuses.Contains("in");
            rows = rows.Where(r =>
                (wantOut && r.Sellable == 0)
                || (wantLow && r.Sellable > 0 && r.Sellable <= r.ReorderLevel)
                || (wantIn && r.Sellable > r.ReorderLevel));
        }

        var expiryStatuses = query.ExpiryStatuses ?? [];
        if (expiryStatuses.Count > 0)
        {
            bool wantExpired = expiryStatuses.Contains("expired");
            bool wantExpiring = expiryStatuses.Contains("expiring");
            rows = rows.Where(r => r.NearestExpiry != null
                && ((wantExpired && r.NearestExpiry < today)
                    || (wantExpiring && r.NearestExpiry >= today && r.NearestExpiry <= soon)));
        }

        return rows;
    }

    private static IOrderedQueryable<MedicineStockRow> Order(IQueryable<MedicineStockRow> rows, string sortBy, bool descending) => sortBy switch
    {
        "quantity" => descending
            ? rows.OrderByDescending(r => r.Sellable).ThenBy(r => r.Name).ThenBy(r => r.Id)
            : rows.OrderBy(r => r.Sellable).ThenBy(r => r.Name).ThenBy(r => r.Id),
        // Medicines with no stocked lot sort last either way.
        "expiry" => descending
            ? rows.OrderBy(r => r.NearestExpiry == null).ThenByDescending(r => r.NearestExpiry).ThenBy(r => r.Name).ThenBy(r => r.Id)
            : rows.OrderBy(r => r.NearestExpiry == null).ThenBy(r => r.NearestExpiry).ThenBy(r => r.Name).ThenBy(r => r.Id),
        "price" => descending
            ? rows.OrderByDescending(r => r.UnitPrice).ThenBy(r => r.Name).ThenBy(r => r.Id)
            : rows.OrderBy(r => r.UnitPrice).ThenBy(r => r.Name).ThenBy(r => r.Id),
        "updated" => descending
            ? rows.OrderByDescending(r => r.UpdatedAtUtc).ThenBy(r => r.Name).ThenBy(r => r.Id)
            : rows.OrderBy(r => r.UpdatedAtUtc).ThenBy(r => r.Name).ThenBy(r => r.Id),
        _ => descending
            ? rows.OrderByDescending(r => r.Name).ThenBy(r => r.Id)
            : rows.OrderBy(r => r.Name).ThenBy(r => r.Id),
    };

    private static MedicineDto ToDto(Medicine m, IReadOnlyList<MedicineBatch> batches, Guid? stockScope, DateOnly today, Guid? branchId)
    {
        var inScope = batches.Where(b => b.MedicineId == m.Id && (stockScope == null || b.BranchId == stockScope)).ToList();
        var agg = MedicineBatchAggregator.Aggregate(inScope, today).GetOrEmpty(m.Id);
        var atBranch = branchId is { } bid ? batches.Where(b => b.MedicineId == m.Id && b.BranchId == bid).ToList() : null;

        return new MedicineDto(
            m.Id, m.Name, m.GenericName, m.CategoryId, m.ReorderLevel, m.IsControlled,
            inScope.Where(b => !b.IsDisposed).Sum(b => b.QuantityOnHand),
            m.IsDeleted, m.CreatedAtUtc, m.UpdatedAtUtc, m.DeletedOnUtc, m.DeletedBy,
            agg.NearestExpiry, agg.Count, agg.RackLocations, agg.FefoPicks,
            m.UnitPrice, m.CostPrice, m.Form, m.Strength,
            m.SupplierId, m.Barcode, m.Description, m.MaximumStock, m.PrescriptionRequired,
            m.BrandName, m.Dosage, m.SideEffects, m.StorageInstructions,
            m.StorageTempMinC, m.StorageTempMaxC, m.RequiresColdChain,
            m.UnitsPerPack, m.UnitLabel, m.IsTaxable,
            m.SupplierInvoiceNumber, m.VatAmount,
            atBranch?.Where(b => !b.IsDisposed).Sum(b => b.QuantityOnHand),
            m.ControlledSchedule,
            SellableQuantityOnHand: inScope.Where(b => FefoBatchOrdering.IsSellable(b, today)).Sum(b => b.QuantityOnHand),
            BranchSellableQuantityOnHand: atBranch?.Where(b => FefoBatchOrdering.IsSellable(b, today)).Sum(b => b.QuantityOnHand),
            PacksPerBox: m.PacksPerBox,
            BoxLabel: m.BoxLabel);
    }
}
