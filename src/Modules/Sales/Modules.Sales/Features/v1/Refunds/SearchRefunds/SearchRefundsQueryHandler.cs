using System.Diagnostics.CodeAnalysis;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.Refunds;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Shared;
using FSH.Modules.Sales.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Refunds.SearchRefunds;

/// <summary>
/// Paged refunds list. Filters, amount bounds (net refund = sum of lines + tax refund − processing
/// fee, floored at zero), search and sort all run in the database; only the page is materialized.
/// The original invoice number and display fields are batch-resolved per page.
/// </summary>
public sealed class SearchRefundsQueryHandler(SalesDbContext dbContext, ICurrentBranch currentBranch, IMediator mediator)
    : IQueryHandler<SearchRefundsQuery, PagedResponse<SaleRefundDto>>
{
    public async ValueTask<PagedResponse<SaleRefundDto>> Handle(SearchRefundsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 50 : query.PageSize;

        IQueryable<SaleRefund> q = dbContext.SaleRefunds.AsNoTracking();

        if (query.CustomerId is { } customerId)
        {
            q = q.Where(r => r.CustomerId == customerId);
        }

        if (query.SaleId is { } saleId)
        {
            q = q.Where(r => r.OriginalSaleId == saleId);
        }

        if (!string.IsNullOrWhiteSpace(query.Status)
            && Enum.TryParse<RefundStatus>(query.Status, ignoreCase: true, out var status))
        {
            q = q.Where(r => r.Status == status);
        }

        if (query.DateFromUtc is { } from)
        {
            q = q.Where(r => r.RefundDateUtc >= from);
        }

        if (query.DateToUtc is { } to)
        {
            q = q.Where(r => r.RefundDateUtc <= to);
        }

        if (query.FromDate is { } fromDay)
        {
            var fromUtc = NepalDayRange.StartUtc(fromDay);
            q = q.Where(r => r.RefundDateUtc >= fromUtc);
        }

        if (query.ToDate is { } toDay)
        {
            var toExclusiveUtc = NepalDayRange.EndExclusiveUtc(toDay);
            q = q.Where(r => r.RefundDateUtc < toExclusiveUtc);
        }

        if (branchFilter is { } branchId)
        {
            q = q.Where(r => r.BranchId == branchId);
        }

        // Net refund floors at zero (SaleRefund.NetRefundAmount); a negative raw value only ever
        // compares as 0, so the bounds below test the floored value.
        if (query.MinAmount is { } min)
        {
            q = q.Where(r =>
                (r.Items.Sum(i => i.QuantityRefunded * i.UnitPrice) + r.TaxRefundAmount - r.ProcessingFee > 0
                    ? r.Items.Sum(i => i.QuantityRefunded * i.UnitPrice) + r.TaxRefundAmount - r.ProcessingFee
                    : 0m) >= min);
        }

        if (query.MaxAmount is { } max)
        {
            q = q.Where(r =>
                (r.Items.Sum(i => i.QuantityRefunded * i.UnitPrice) + r.TaxRefundAmount - r.ProcessingFee > 0
                    ? r.Items.Sum(i => i.QuantityRefunded * i.UnitPrice) + r.TaxRefundAmount - r.ProcessingFee
                    : 0m) <= max);
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

        var saleIds = pageItems.Select(r => r.OriginalSaleId).Distinct().ToList();
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

        return new PagedResponse<SaleRefundDto>
        {
            Items = pageItems
                .Select(r => RefundMapper.ToDto(
                    r,
                    invoiceNumbers.GetValueOrDefault(r.OriginalSaleId),
                    medicines: medicines,
                    customers: customers))
                .ToList(),
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size)
        };
    }

    [SuppressMessage("Globalization", "CA1304", Justification = ListSearch.EfTranslatedCaseFold)]
    [SuppressMessage("Globalization", "CA1311", Justification = ListSearch.EfTranslatedCaseFold)]
    [SuppressMessage("Performance", "CA1862", Justification = ListSearch.EfTranslatedCaseFold)]
    private IQueryable<SaleRefund> ApplySearch(IQueryable<SaleRefund> q, string term, List<Guid> customerIds)
    {
        string? saleIdPrefix = ListSearch.IdPrefix(term, "SALE");
        bool hasCustomers = customerIds.Count > 0;

        var salesWithMatchingInvoice = dbContext.Sales
            .Where(s => s.InvoiceNumber != null && s.InvoiceNumber.ToUpper().Contains(term))
            .Select(s => s.Id);

        return q.Where(r =>
            r.RefundNumber.ToUpper().Contains(term)
            || (r.CreditNoteNumber != null && r.CreditNoteNumber.ToUpper().Contains(term))
            || r.RefundReason.ToUpper().Contains(term)
            || (r.Notes != null && r.Notes.ToUpper().Contains(term))
            || (saleIdPrefix != null && r.OriginalSaleId.ToString().ToUpper().StartsWith(saleIdPrefix))
            || salesWithMatchingInvoice.Contains(r.OriginalSaleId)
            || (hasCustomers && r.CustomerId != null && customerIds.Contains(r.CustomerId.Value)));
    }

    private static IQueryable<SaleRefund> ApplySort(IQueryable<SaleRefund> q, string? sortBy, string? sortOrder)
    {
        bool asc = ListSearch.IsAscending(sortOrder);
        IOrderedQueryable<SaleRefund> ordered = ListSearch.NormalizeSortField(sortBy) switch
        {
            "CREATED_AT" => asc ? q.OrderBy(r => r.CreatedAtUtc) : q.OrderByDescending(r => r.CreatedAtUtc),
            "NET_REFUND_AMOUNT" or "REFUND_AMOUNT" => asc
                ? q.OrderBy(r => r.Items.Sum(i => i.QuantityRefunded * i.UnitPrice) + r.TaxRefundAmount - r.ProcessingFee)
                : q.OrderByDescending(r => r.Items.Sum(i => i.QuantityRefunded * i.UnitPrice) + r.TaxRefundAmount - r.ProcessingFee),
            "REFUND_NUMBER" => asc ? q.OrderBy(r => r.RefundNumber) : q.OrderByDescending(r => r.RefundNumber),
            "STATUS" => asc ? q.OrderBy(r => r.Status) : q.OrderByDescending(r => r.Status),
            _ => asc ? q.OrderBy(r => r.RefundDateUtc) : q.OrderByDescending(r => r.RefundDateUtc),
        };

        return asc ? ordered.ThenBy(r => r.Id) : ordered.ThenByDescending(r => r.Id);
    }
}
