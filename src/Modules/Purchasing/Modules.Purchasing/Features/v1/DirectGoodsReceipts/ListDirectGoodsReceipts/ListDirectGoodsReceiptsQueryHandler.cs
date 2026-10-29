using FSH.Framework.Shared.Persistence;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.Dtos;
using FSH.Modules.Purchasing.Contracts.v1.DirectGoodsReceipts;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using FSH.Modules.Purchasing.Features.v1.DirectGoodsReceipts.GetDirectGoodsReceiptById;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Purchasing.Features.v1.DirectGoodsReceipts.ListDirectGoodsReceipts;

/// <summary>Mirrors listDirectGoodsReceipts's ordering (receipt date desc, then created-at desc), paged and
/// filtered on the server. Branch-required entity: an omitted branchId defaults to the current branch
/// (docs/branch-scoping-plan.md §2).</summary>
public sealed class ListDirectGoodsReceiptsQueryHandler(
    PurchasingDbContext dbContext, ICurrentBranch currentBranch, IMediator mediator)
    : IQueryHandler<ListDirectGoodsReceiptsQuery, PagedResponse<DirectGoodsReceiptDto>>
{
    public async ValueTask<PagedResponse<DirectGoodsReceiptDto>> Handle(ListDirectGoodsReceiptsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > ListDirectGoodsReceiptsQuery.MaxPageSize ? 50 : query.PageSize;

        var receiptsQuery = dbContext.DirectGoodsReceipts.AsNoTracking().AsQueryable();

        // An explicit branchId wins; otherwise default to the current branch. A null current branch
        // (no tenant / operator call) leaves the query unfiltered.
        var branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);
        if (branchId is { } scopedBranchId)
        {
            receiptsQuery = receiptsQuery.Where(r => r.BranchId == scopedBranchId);
        }

        if (TryParseStatus(query.Status, out var status) && status is { } wanted)
        {
            receiptsQuery = receiptsQuery.Where(r => r.Status == wanted);
        }

        if (TryParseSource(query.Source, out var source) && source is { } wantedSource)
        {
            receiptsQuery = receiptsQuery.Where(r => r.Source == wantedSource);
        }

        if (query.SupplierId is { } supplierId)
        {
            receiptsQuery = receiptsQuery.Where(r => r.SupplierId == supplierId);
        }

        if (query.DateFromUtc is { } from)
        {
            receiptsQuery = receiptsQuery.Where(r => r.ReceiptDateUtc >= from);
        }

        if (query.DateToUtc is { } to)
        {
            receiptsQuery = receiptsQuery.Where(r => r.ReceiptDateUtc <= to);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            string term = query.Search.Trim();
            string upper = term.ToUpperInvariant();

            // Supplier names live in the Suppliers module, so the matching supplier ids are resolved first.
            var matchingSuppliers = await mediator.Send(
                new GetSupplierLookupQuery(Search: term, IncludeInactive: true, Limit: GetSupplierLookupQuery.MaxLimit),
                cancellationToken).ConfigureAwait(false);
            var supplierIds = (matchingSuppliers ?? []).Select(s => s.Id).ToList();

#pragma warning disable CA1304, CA1310, CA1311, CA1862 // Upper-cased matching translates to SQL upper(); the culture overloads do not.
            var matchingOrderIds = dbContext.PurchaseOrders
                .Where(o => o.OrderNumber != null && o.OrderNumber.ToUpper().Contains(upper))
                .Select(o => (Guid?)o.Id);

            receiptsQuery = receiptsQuery.Where(r =>
                supplierIds.Contains(r.SupplierId)
                || (r.PurchaseOrderId != null && matchingOrderIds.Contains(r.PurchaseOrderId))
                || (r.ReceiptNumber != null && r.ReceiptNumber.ToUpper().Contains(upper))
                || (r.SupplierInvoiceNumber != null && r.SupplierInvoiceNumber.ToUpper().Contains(upper)));
#pragma warning restore CA1304, CA1310, CA1311, CA1862
        }

        long total = await receiptsQuery.LongCountAsync(cancellationToken).ConfigureAwait(false);

        var receipts = await receiptsQuery
            .Include(r => r.Lines)
            .OrderByDescending(r => r.ReceiptDateUtc)
            .ThenByDescending(r => r.CreatedAtUtc)
            .ThenByDescending(r => r.Id)
            .Skip((page - 1) * size)
            .Take(size)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var names = await GetDirectGoodsReceiptByIdQueryHandler.LoadNamesAsync(mediator, receipts, cancellationToken)
            .ConfigureAwait(false);
        var orderNumbers = await GetDirectGoodsReceiptByIdQueryHandler.LoadOrderNumbersAsync(dbContext, receipts, cancellationToken)
            .ConfigureAwait(false);

        return new PagedResponse<DirectGoodsReceiptDto>
        {
            Items = receipts.Select(r => GetDirectGoodsReceiptByIdQueryHandler.Map(r, names, orderNumbers)).ToList(),
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size),
        };
    }

    /// <summary>Blank or "all" = no source filter; otherwise a <see cref="GoodsReceiptSource"/> name (any casing).</summary>
    internal static bool TryParseSource(string? value, out GoodsReceiptSource? source)
    {
        source = null;
        if (string.IsNullOrWhiteSpace(value) || value.Trim().Equals("all", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        string trimmed = value.Trim();
        if (int.TryParse(trimmed, out _)
            || !Enum.TryParse(trimmed, ignoreCase: true, out GoodsReceiptSource parsed)
            || !Enum.IsDefined(parsed))
        {
            return false;
        }

        source = parsed;
        return true;
    }

    /// <summary>Blank = no status filter; otherwise a <see cref="DirectGoodsReceiptStatus"/> name (any casing).</summary>
    internal static bool TryParseStatus(string? value, out DirectGoodsReceiptStatus? status)
    {
        status = null;
        if (string.IsNullOrWhiteSpace(value))
        {
            return true;
        }

        string trimmed = value.Trim();
        if (int.TryParse(trimmed, out _)
            || !Enum.TryParse(trimmed, ignoreCase: true, out DirectGoodsReceiptStatus parsed)
            || !Enum.IsDefined(parsed))
        {
            return false;
        }

        status = parsed;
        return true;
    }
}
