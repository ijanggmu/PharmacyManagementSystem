using FSH.Framework.Shared.Persistence;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.Dtos;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders.SearchPurchaseOrders;

public sealed class SearchPurchaseOrdersQueryHandler(PurchasingDbContext dbContext, IMediator mediator, ICurrentBranch currentBranch)
    : IQueryHandler<SearchPurchaseOrdersQuery, PagedResponse<PurchaseOrderDto>>
{
    public async ValueTask<PagedResponse<PurchaseOrderDto>> Handle(SearchPurchaseOrdersQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 50 : query.PageSize;

        var q = dbContext.PurchaseOrders.AsNoTracking().Include(o => o.Lines).AsQueryable();

        // Legacy orders without a branch stay visible everywhere until backfilled.
        if (await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false) is { } branchId)
        {
            q = q.Where(o => o.BranchId == branchId || o.BranchId == null);
        }

        if (query.SupplierId is { } supplierId)
        {
            q = q.Where(o => o.SupplierId == supplierId);
        }

        if (PurchaseOrderStatusFilter.TryParse(query.Status, out var statuses) && statuses.Count > 0)
        {
            q = q.Where(o => statuses.Contains(o.Status));
        }

        if (query.DateFromUtc is { } from)
        {
            q = q.Where(o => o.OrderDateUtc >= from);
        }

        if (query.DateToUtc is { } to)
        {
            q = q.Where(o => o.OrderDateUtc <= to);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            string term = query.Search.Trim();
            string upper = term.ToUpperInvariant();

            // Supplier names live in the Suppliers module, so the matching supplier ids are resolved first.
            var matchingSuppliers = await mediator.Send(
                new GetSupplierLookupQuery(Search: term, IncludeInactive: true, Limit: GetSupplierLookupQuery.MaxLimit),
                cancellationToken).ConfigureAwait(false);
            var supplierIds = matchingSuppliers.Select(s => s.Id).ToList();

            // Upper-cased matching translates to SQL upper()/uuid::text on Npgsql and also runs in memory; the
            // culture/comparison overloads the analyzers ask for do not translate.
#pragma warning disable CA1304, CA1310, CA1311, CA1862
            q = q.Where(o =>
                supplierIds.Contains(o.SupplierId)
                || o.Id.ToString().ToUpper().StartsWith(upper)
                || (o.OrderNumber != null && o.OrderNumber.ToUpper().Contains(upper))
                || (o.SupplierInvoiceNumber != null && o.SupplierInvoiceNumber.ToUpper().Contains(upper))
                || (o.Narration != null && o.Narration.ToUpper().Contains(upper)));
#pragma warning restore CA1304, CA1310, CA1311, CA1862
        }

        q = q.OrderByDescending(o => o.OrderDateUtc).ThenByDescending(o => o.CreatedAtUtc);

        long total = await q.LongCountAsync(cancellationToken).ConfigureAwait(false);
        var orders = await q
            .Skip((page - 1) * size)
            .Take(size)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var names = await PurchaseOrderMapper.LoadNamesAsync(mediator, orders, cancellationToken).ConfigureAwait(false);
        var receiptNumbers = await PurchaseOrderMapper.LoadReceiptNumbersAsync(dbContext, orders, cancellationToken)
            .ConfigureAwait(false);

        return new PagedResponse<PurchaseOrderDto>
        {
            Items = orders.Select(o => PurchaseOrderMapper.ToDto(o, names, receiptNumbers)).ToList(),
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size)
        };
    }
}
