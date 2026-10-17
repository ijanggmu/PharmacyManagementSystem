using FSH.Framework.Shared.Persistence;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Transactions;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.v1.Documents;
using FSH.Modules.Sales.Contracts.v1.Returns;
using FSH.Modules.Sales.Contracts.v1.Sales;
using FSH.Modules.Suppliers.Contracts.v1.Returns;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Transactions.SearchInventoryTransactions;

public sealed class SearchInventoryTransactionsQueryHandler(
    InventoryDbContext dbContext,
    ICurrentBranch currentBranch,
    IMediator mediator,
    IUserService users)
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

        var referenceNumbers = await LoadReferenceNumbersAsync(transactions, cancellationToken).ConfigureAwait(false);
        var userNames = transactions.Any(t => !string.IsNullOrWhiteSpace(t.CreatedBy))
            ? await LoadUserNamesAsync(cancellationToken).ConfigureAwait(false)
            : new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        var items = transactions.Select(t => new InventoryTransactionDto(
            t.Id, t.MedicineId, medicineNames.GetValueOrDefault(t.MedicineId), t.BranchId, t.MedicineBatchId,
            t.MedicineBatchId is { } batchId ? batchNumbers.GetValueOrDefault(batchId) : null,
            t.Type.ToString(), t.QuantityDelta, t.UnitCostPrice, t.ReferenceType, t.ReferenceId,
            t.Notes, t.CreatedAtUtc,
            t.ReferenceId is { } refId ? referenceNumbers.GetValueOrDefault(refId) : null,
            t.CreatedBy is { } by ? userNames.GetValueOrDefault(by) : null))
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

    /// <summary>
    /// The referenced documents' own numbers, by reference id: sale invoices, purchase orders and goods receipts,
    /// customer-return credit notes and supplier-return debit notes (looked up in their modules), and this
    /// module's stock transfers and counts. References with no number of their own are left out.
    /// </summary>
    private async Task<Dictionary<Guid, string>> LoadReferenceNumbersAsync(
        List<InventoryTransaction> transactions, CancellationToken cancellationToken)
    {
        List<Guid> IdsOf(params string[] types) => transactions
            .Where(t => t.ReferenceId is not null && types.Contains(t.ReferenceType, StringComparer.OrdinalIgnoreCase))
            .Select(t => t.ReferenceId!.Value).Distinct().ToList();

        var result = new Dictionary<Guid, string>();
        void Add(Guid id, string? number)
        {
            if (!string.IsNullOrWhiteSpace(number)) result[id] = number;
        }

        var saleIds = IdsOf("Sale");
        if (saleIds.Count > 0)
        {
            foreach (var s in await mediator.Send(new GetSaleInvoiceNumbersQuery(saleIds), cancellationToken).ConfigureAwait(false))
            {
                Add(s.SaleId, s.InvoiceNumber);
            }
        }

        var receiptIds = IdsOf("DirectGoodsReceipt", "DirectGoodsReceiptVoid");
        var orderIds = IdsOf("PurchaseOrder");
        if (receiptIds.Count > 0 || orderIds.Count > 0)
        {
            var docs = await mediator.Send(new GetPurchaseDocumentNumbersQuery(receiptIds, orderIds), cancellationToken).ConfigureAwait(false);
            foreach (var d in docs)
            {
                Add(d.Id, d.DocumentNumber);
            }
        }

        var returnIds = IdsOf("Return");
        if (returnIds.Count > 0)
        {
            foreach (var r in await mediator.Send(new GetSaleReturnNumbersQuery(returnIds), cancellationToken).ConfigureAwait(false))
            {
                Add(r.ReturnId, r.CreditNoteNumber);
            }
        }

        var supplierReturnIds = IdsOf("SupplierReturn");
        if (supplierReturnIds.Count > 0)
        {
            foreach (var r in await mediator.Send(new GetSupplierReturnNumbersQuery(supplierReturnIds), cancellationToken).ConfigureAwait(false))
            {
                Add(r.ReturnId, r.DocumentNumber);
            }
        }

        var transferIds = IdsOf("StockTransfer", "StockTransferIn", "StockTransferOut");
        if (transferIds.Count > 0)
        {
            var transfers = await dbContext.StockTransfers.AsNoTracking()
                .Where(x => transferIds.Contains(x.Id))
                .Select(x => new { x.Id, x.TransferNumber })
                .ToListAsync(cancellationToken).ConfigureAwait(false);
            transfers.ForEach(x => Add(x.Id, x.TransferNumber));
        }

        var countIds = IdsOf("StockCount");
        if (countIds.Count > 0)
        {
            var counts = await dbContext.StockCountSessions.AsNoTracking()
                .Where(x => countIds.Contains(x.Id))
                .Select(x => new { x.Id, x.SessionNumber })
                .ToListAsync(cancellationToken).ConfigureAwait(false);
            counts.ForEach(x => Add(x.Id, x.SessionNumber));
        }

        return result;
    }

    /// <summary>Display names by user id (one user list per page, as the IRD register does).</summary>
    private async Task<Dictionary<string, string>> LoadUserNamesAsync(CancellationToken cancellationToken)
    {
        var list = await users.GetListAsync(cancellationToken).ConfigureAwait(false);
        return list
            .Where(u => !string.IsNullOrWhiteSpace(u.Id))
            .GroupBy(u => u.Id!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                g => g.Key,
                g =>
                {
                    var u = g.First();
                    string full = $"{u.FirstName} {u.LastName}".Trim();
                    return full.Length > 0 ? full : u.UserName ?? u.Email ?? g.Key;
                },
                StringComparer.OrdinalIgnoreCase);
    }

    /// <summary>CreatedAtUtc is stored as UTC; an unspecified-kind bound is taken as UTC already.</summary>
    private static DateTime ToUtc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
    };
}
