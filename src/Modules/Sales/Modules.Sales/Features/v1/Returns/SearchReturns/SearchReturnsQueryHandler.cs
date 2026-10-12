using System.Diagnostics.CodeAnalysis;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.Returns;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Shared;
using FSH.Modules.Sales.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Returns.SearchReturns;

/// <summary>
/// Paged customer-returns list. Filters, amount bounds (the return total is the sum of its lines,
/// <c>QuantityReturned * UnitPrice</c>), search and sort all run in the database; only the page is
/// materialized. Display fields are batch-resolved per page.
/// </summary>
public sealed class SearchReturnsQueryHandler(SalesDbContext dbContext, ICurrentBranch currentBranch, IMediator mediator)
    : IQueryHandler<SearchReturnsQuery, PagedResponse<SaleReturnDto>>
{
    public async ValueTask<PagedResponse<SaleReturnDto>> Handle(SearchReturnsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 50 : query.PageSize;

        IQueryable<SaleReturn> q = dbContext.SaleReturns.AsNoTracking();

        if (query.CustomerId is { } customerId)
        {
            q = q.Where(r => r.CustomerId == customerId);
        }

        if (query.SaleId is { } saleId)
        {
            q = q.Where(r => r.SaleId == saleId);
        }

        if (!string.IsNullOrWhiteSpace(query.Status)
            && Enum.TryParse<ReturnStatus>(query.Status, ignoreCase: true, out var status))
        {
            q = q.Where(r => r.Status == status);
        }

        if (query.DateFromUtc is { } from)
        {
            q = q.Where(r => r.ReturnDateUtc >= from);
        }

        if (query.DateToUtc is { } to)
        {
            q = q.Where(r => r.ReturnDateUtc <= to);
        }

        if (query.FromDate is { } fromDay)
        {
            var fromUtc = NepalDayRange.StartUtc(fromDay);
            q = q.Where(r => r.ReturnDateUtc >= fromUtc);
        }

        if (query.ToDate is { } toDay)
        {
            var toExclusiveUtc = NepalDayRange.EndExclusiveUtc(toDay);
            q = q.Where(r => r.ReturnDateUtc < toExclusiveUtc);
        }

        if (branchFilter is { } branchId)
        {
            q = q.Where(r => r.BranchId == branchId);
        }

        if (query.MinAmount is { } min)
        {
            q = q.Where(r => r.Items.Sum(i => i.QuantityReturned * i.UnitPrice) >= min);
        }

        if (query.MaxAmount is { } max)
        {
            q = q.Where(r => r.Items.Sum(i => i.QuantityReturned * i.UnitPrice) <= max);
        }

        if (ListSearch.Normalize(query.Search) is { } term)
        {
            var customerIds = await CrossModuleLookups
                .MatchingCustomerIdsAsync(mediator, query.Search!.Trim(), cancellationToken)
                .ConfigureAwait(false);
            q = ApplySearch(q, term, customerIds);
        }

        q = ApplySort(q, query.SortBy, query.SortOrder);

        long total = await q.LongCountAsync(cancellationToken).ConfigureAwait(false);
        var pageItems = await q
            .Include(r => r.Items)
            .Skip((page - 1) * size)
            .Take(size)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var saleIds = pageItems.Select(r => r.SaleId).Distinct().ToList();
        var invoiceNumbers = await dbContext.Sales
            .AsNoTracking()
            .Where(s => saleIds.Contains(s.Id))
            .Select(s => new { s.Id, s.InvoiceNumber })
            .ToDictionaryAsync(s => s.Id, s => s.InvoiceNumber, cancellationToken)
            .ConfigureAwait(false);
        var medicines = await CrossModuleLookups
            .MedicinesAsync(mediator, pageItems.SelectMany(r => r.Items).Select(i => i.MedicineId), cancellationToken)
            .ConfigureAwait(false);
        var customers = await CrossModuleLookups
            .CustomersAsync(mediator, pageItems.Select(r => r.CustomerId), cancellationToken)
            .ConfigureAwait(false);
        var payouts = await ReturnMapper.PayoutsAsync(dbContext, pageItems.Select(r => r.Id).ToList(), cancellationToken)
            .ConfigureAwait(false);

        return new PagedResponse<SaleReturnDto>
        {
            Items = pageItems.Select(r => ReturnMapper.ToDto(r, medicines, customers, invoiceNumbers, payouts)).ToList(),
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size)
        };
    }

    [SuppressMessage("Globalization", "CA1304", Justification = ListSearch.EfTranslatedCaseFold)]
    [SuppressMessage("Globalization", "CA1311", Justification = ListSearch.EfTranslatedCaseFold)]
    [SuppressMessage("Performance", "CA1862", Justification = ListSearch.EfTranslatedCaseFold)]
    private IQueryable<SaleReturn> ApplySearch(IQueryable<SaleReturn> q, string term, List<Guid> customerIds)
    {
        string? returnIdPrefix = ListSearch.IdPrefix(term, "RET");
        string? saleIdPrefix = ListSearch.IdPrefix(term, "SALE");
        bool hasCustomers = customerIds.Count > 0;

        var salesWithMatchingInvoice = dbContext.Sales
            .Where(s => s.InvoiceNumber != null && s.InvoiceNumber.ToUpper().Contains(term))
            .Select(s => s.Id);

        return q.Where(r =>
            r.ReturnReason.ToUpper().Contains(term)
            || (r.Notes != null && r.Notes.ToUpper().Contains(term))
            || (returnIdPrefix != null && r.Id.ToString().ToUpper().StartsWith(returnIdPrefix))
            || (saleIdPrefix != null && r.SaleId.ToString().ToUpper().StartsWith(saleIdPrefix))
            || salesWithMatchingInvoice.Contains(r.SaleId)
            || (hasCustomers && r.CustomerId != null && customerIds.Contains(r.CustomerId.Value)));
    }

    private static IQueryable<SaleReturn> ApplySort(IQueryable<SaleReturn> q, string? sortBy, string? sortOrder)
    {
        bool asc = ListSearch.IsAscending(sortOrder);
        IOrderedQueryable<SaleReturn> ordered = ListSearch.NormalizeSortField(sortBy) switch
        {
            "CREATED_AT" => asc ? q.OrderBy(r => r.CreatedAtUtc) : q.OrderByDescending(r => r.CreatedAtUtc),
            "TOTAL_RETURN_AMOUNT" => asc
                ? q.OrderBy(r => r.Items.Sum(i => i.QuantityReturned * i.UnitPrice))
                : q.OrderByDescending(r => r.Items.Sum(i => i.QuantityReturned * i.UnitPrice)),
            "STATUS" => asc ? q.OrderBy(r => r.Status) : q.OrderByDescending(r => r.Status),
            _ => asc ? q.OrderBy(r => r.ReturnDateUtc) : q.OrderByDescending(r => r.ReturnDateUtc),
        };

        return asc ? ordered.ThenBy(r => r.Id) : ordered.ThenByDescending(r => r.Id);
    }
}
