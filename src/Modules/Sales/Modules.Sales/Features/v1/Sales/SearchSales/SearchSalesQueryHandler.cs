using System.Diagnostics.CodeAnalysis;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.Sales;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Shared;
using FSH.Modules.Sales.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Sales.SearchSales;

/// <summary>
/// Paged sales list. Every filter and sort runs in the database: the sale total has no column, so it
/// is expressed as the sum of its lines (<c>Quantity * UnitPrice - DiscountAmount</c>), which EF
/// translates to a correlated subquery. Customer-name search resolves matching customer ids through
/// Customers.Contracts first; medicine and customer display fields are batch-resolved per page.
/// </summary>
public sealed class SearchSalesQueryHandler(SalesDbContext dbContext, ICurrentBranch currentBranch, IMediator mediator)
    : IQueryHandler<SearchSalesQuery, PagedResponse<SaleDto>>
{
    public async ValueTask<PagedResponse<SaleDto>> Handle(SearchSalesQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 50 : query.PageSize;

        IQueryable<Sale> q = dbContext.Sales.AsNoTracking();

        if (query.CustomerId is { } customerId)
        {
            q = q.Where(s => s.CustomerId == customerId);
        }

        if (!string.IsNullOrWhiteSpace(query.Status)
            && Enum.TryParse<SaleStatus>(query.Status, ignoreCase: true, out var status))
        {
            q = q.Where(s => s.Status == status);
        }

        if (query.CashierUserId is { } cashierUserId)
        {
            q = q.Where(s => s.CashierUserId == cashierUserId);
        }

        if (query.MedicineId is { } medicineId)
        {
            q = q.Where(s => s.Items.Any(i => i.MedicineId == medicineId));
        }

        if (query.OnlyWithBalanceDue)
        {
            q = q.Where(s => s.BalanceDue > 0);
        }

        q = ApplyDateRange(q, query);

        // Branch-required entity: an omitted branchId defaults to the current branch (explicit wins).
        // A null current branch (no tenant / operator call) leaves the query unfiltered.
        var branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);
        if (branchId is { } scopedBranchId)
        {
            q = q.Where(s => s.BranchId == scopedBranchId);
        }

        q = ApplyPaymentStatuses(q, ListSearch.SplitValues(query.PaymentStatuses));
        q = ApplyPaymentMethods(q, ListSearch.SplitValues(query.PaymentMethods));

        if (query.MinAmount is { } min)
        {
            q = q.Where(s => s.Items.Sum(i => (i.Quantity * i.UnitPrice) - i.DiscountAmount) >= min);
        }

        if (query.MaxAmount is { } max)
        {
            q = q.Where(s => s.Items.Sum(i => (i.Quantity * i.UnitPrice) - i.DiscountAmount) <= max);
        }

        if (ListSearch.Normalize(query.Search) is { } term)
        {
            var customerIds = await CrossModuleLookups
                .MatchingCustomerIdsAsync(mediator, query.Search!.Trim(), cancellationToken)
                .ConfigureAwait(false);
            q = ApplySearch(q, term, customerIds);
        }

        q = ApplySort(q, query);

        long total = await q.LongCountAsync(cancellationToken).ConfigureAwait(false);
        var sales = await q
            .Include(s => s.Items)
            .Include(s => s.Payments)
            .Skip((page - 1) * size)
            .Take(size)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var medicines = await CrossModuleLookups
            .MedicinesAsync(mediator, sales.SelectMany(s => s.Items).Select(i => i.MedicineId), cancellationToken)
            .ConfigureAwait(false);
        var customers = await CrossModuleLookups
            .CustomersAsync(mediator, sales.Select(s => s.CustomerId), cancellationToken)
            .ConfigureAwait(false);

        // Lets the list hide Process return / Cancel sale once everything on a sale has come back.
        var reversed = await SaleReversedQuantities
            .LoadAsync(dbContext, sales.Select(s => s.Id).ToList(), cancellationToken)
            .ConfigureAwait(false);

        return new PagedResponse<SaleDto>
        {
            Items = sales.Select(s => SaleMapper.ToDto(s, medicines, customers, reversedByLine: reversed)).ToList(),
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size)
        };
    }

    private static IQueryable<Sale> ApplyDateRange(IQueryable<Sale> q, SearchSalesQuery query)
    {
        if (query.DateFromUtc is { } from)
        {
            q = q.Where(s => s.SaleDateUtc >= from);
        }

        if (query.DateToUtc is { } to)
        {
            q = q.Where(s => s.SaleDateUtc <= to);
        }

        if (query.FromDate is { } fromDay)
        {
            var fromUtc = NepalDayRange.StartUtc(fromDay);
            q = q.Where(s => s.SaleDateUtc >= fromUtc);
        }

        if (query.ToDate is { } toDay)
        {
            var toExclusiveUtc = NepalDayRange.EndExclusiveUtc(toDay);
            q = q.Where(s => s.SaleDateUtc < toExclusiveUtc);
        }

        return q;
    }

    /// <summary>
    /// Maps the web app's payment-status values onto what a .NET sale stores: paid/completed = nothing
    /// owed, pending = a balance due (both exclude cancelled sales), refunded = has a completed refund,
    /// cancelled = the sale status. "failed" has no .NET counterpart, so on its own it matches nothing.
    /// </summary>
    private IQueryable<Sale> ApplyPaymentStatuses(IQueryable<Sale> q, IReadOnlyList<string> statuses)
    {
        if (statuses.Count == 0)
        {
            return q;
        }

        bool paid = statuses.Contains("PAID") || statuses.Contains("COMPLETED");
        bool pending = statuses.Contains("PENDING");
        bool refunded = statuses.Contains("REFUNDED");
        bool cancelled = statuses.Contains("CANCELLED");

        var refundedSaleIds = dbContext.SaleRefunds
            .Where(r => r.Status == RefundStatus.Completed)
            .Select(r => r.OriginalSaleId);

        return q.Where(s =>
            (paid && s.Status != SaleStatus.Cancelled && s.BalanceDue <= 0)
            || (pending && s.Status != SaleStatus.Cancelled && s.BalanceDue > 0)
            || (refunded && refundedSaleIds.Contains(s.Id))
            || (cancelled && s.Status == SaleStatus.Cancelled));
    }

    /// <summary>A sale matches a method when its header method is that method ("mixed" for split
    /// tender), or, for a specific method, when one of its tender legs used it.</summary>
    [SuppressMessage("Globalization", "CA1304", Justification = ListSearch.EfTranslatedCaseFold)]
    [SuppressMessage("Globalization", "CA1311", Justification = ListSearch.EfTranslatedCaseFold)]
    [SuppressMessage("Performance", "CA1862", Justification = ListSearch.EfTranslatedCaseFold)]
    private static IQueryable<Sale> ApplyPaymentMethods(IQueryable<Sale> q, IReadOnlyList<string> methods)
    {
        if (methods.Count == 0)
        {
            return q;
        }

        var list = methods.ToList();
        return q.Where(s =>
            list.Contains(s.PaymentMethod.ToUpper())
            || s.Payments.Any(p => list.Contains(p.Method.ToUpper())));
    }

    [SuppressMessage("Globalization", "CA1304", Justification = ListSearch.EfTranslatedCaseFold)]
    [SuppressMessage("Globalization", "CA1311", Justification = ListSearch.EfTranslatedCaseFold)]
    [SuppressMessage("Performance", "CA1862", Justification = ListSearch.EfTranslatedCaseFold)]
    private static IQueryable<Sale> ApplySearch(IQueryable<Sale> q, string term, List<Guid> customerIds)
    {
        string? idPrefix = ListSearch.IdPrefix(term, "SALE", "INV");
        bool hasCustomers = customerIds.Count > 0;

        return q.Where(s =>
            (s.InvoiceNumber != null && s.InvoiceNumber.ToUpper().Contains(term))
            || (s.Notes != null && s.Notes.ToUpper().Contains(term))
            || (idPrefix != null && s.Id.ToString().ToUpper().StartsWith(idPrefix))
            || (hasCustomers && s.CustomerId != null && customerIds.Contains(s.CustomerId.Value)));
    }

    private static IQueryable<Sale> ApplySort(IQueryable<Sale> q, SearchSalesQuery query)
    {
        string? field = ListSearch.NormalizeSortField(query.SortBy);

        // Open-invoices callers want the longest-outstanding balance first (oldest sale date); every
        // other caller keeps the newest-first order the sales list has always used.
        bool asc = query.SortOrder is null && field is null
            ? query.OnlyWithBalanceDue
            : ListSearch.IsAscending(query.SortOrder);

        IOrderedQueryable<Sale> ordered = field switch
        {
            "CREATED_AT" => asc ? q.OrderBy(s => s.CreatedAtUtc) : q.OrderByDescending(s => s.CreatedAtUtc),
            "TOTAL_AMOUNT" => asc
                ? q.OrderBy(s => s.Items.Sum(i => (i.Quantity * i.UnitPrice) - i.DiscountAmount))
                : q.OrderByDescending(s => s.Items.Sum(i => (i.Quantity * i.UnitPrice) - i.DiscountAmount)),
            "INVOICE_NUMBER" => asc ? q.OrderBy(s => s.InvoiceNumber) : q.OrderByDescending(s => s.InvoiceNumber),
            "BALANCE_DUE" => asc ? q.OrderBy(s => s.BalanceDue) : q.OrderByDescending(s => s.BalanceDue),
            _ => asc ? q.OrderBy(s => s.SaleDateUtc) : q.OrderByDescending(s => s.SaleDateUtc),
        };

        // Stable paging: ties (same total, same invoice number) always come back in the same order.
        return asc ? ordered.ThenBy(s => s.Id) : ordered.ThenByDescending(s => s.Id);
    }
}
