using FSH.Framework.Shared.Persistence;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Transactions;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Transactions.SearchInventoryTransactions;

public sealed class SearchInventoryTransactionsQueryHandler(InventoryDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<SearchInventoryTransactionsQuery, PagedResponse<InventoryTransactionDto>>
{
    public async ValueTask<PagedResponse<InventoryTransactionDto>> Handle(
        SearchInventoryTransactionsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 50 : query.PageSize;

        var q = dbContext.InventoryTransactions.AsNoTracking().AsQueryable();

        if (query.MedicineId is { } medicineId)
        {
            q = q.Where(t => t.MedicineId == medicineId);
        }

        // Branch-required entity: an omitted branchId defaults to the current branch (explicit wins).
        // A null current branch (no tenant / operator call) leaves the query unfiltered.
        var branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);
        if (branchId is { } scopedBranchId)
        {
            q = q.Where(t => t.BranchId == scopedBranchId);
        }

        // The validator rejects unknown values, so a non-empty filter always parses here.
        if (InventoryTransactionTypeFilter.TryParse(query.TransactionType, out var type))
        {
            q = q.Where(t => t.Type == type);
        }

        if (query.DateFrom is { } from)
        {
            DateTime fromUtc = ToUtc(from);
            q = q.Where(t => t.CreatedAtUtc >= fromUtc);
        }

        if (query.DateTo is { } to)
        {
            DateTime toUtc = ToUtc(to);
            q = q.Where(t => t.CreatedAtUtc <= toUtc);
        }

        q = q.OrderByDescending(t => t.CreatedAtUtc);

        long total = await q.LongCountAsync(cancellationToken).ConfigureAwait(false);
        var transactions = await q.Skip((page - 1) * size).Take(size)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var medicineIds = transactions.Select(t => t.MedicineId).Distinct().ToList();
        var medicineNames = await dbContext.Medicines.AsNoTracking()
            .Where(m => medicineIds.Contains(m.Id))
            .ToDictionaryAsync(m => m.Id, m => m.Name, cancellationToken)
            .ConfigureAwait(false);

        var batchIds = transactions.Where(t => t.MedicineBatchId is not null)
            .Select(t => t.MedicineBatchId!.Value).Distinct().ToList();
        var batchNumbers = await dbContext.MedicineBatches.AsNoTracking()
            .Where(b => batchIds.Contains(b.Id))
            .ToDictionaryAsync(b => b.Id, b => b.BatchNo, cancellationToken)
            .ConfigureAwait(false);

        var items = transactions.Select(t => new InventoryTransactionDto(
            t.Id, t.MedicineId, medicineNames.GetValueOrDefault(t.MedicineId), t.BranchId, t.MedicineBatchId,
            t.MedicineBatchId is { } batchId ? batchNumbers.GetValueOrDefault(batchId) : null,
            t.Type.ToString(), t.QuantityDelta, t.UnitCostPrice, t.ReferenceType, t.ReferenceId,
            t.Notes, t.CreatedAtUtc))
            .ToList();

        return new PagedResponse<InventoryTransactionDto>
        {
            Items = items,
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size),
        };
    }

    /// <summary>CreatedAtUtc is stored as UTC; an unspecified-kind bound is taken as UTC already.</summary>
    private static DateTime ToUtc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
    };
}
