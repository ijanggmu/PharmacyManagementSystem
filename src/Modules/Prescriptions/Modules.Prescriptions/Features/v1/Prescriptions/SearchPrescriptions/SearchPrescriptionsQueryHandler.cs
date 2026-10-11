using FSH.Framework.Shared.Persistence;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Prescriptions.Contracts.Dtos;
using FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;
using FSH.Modules.Prescriptions.Data;
using FSH.Modules.Prescriptions.Features.v1.Prescriptions.GetPrescriptionById;
using FSH.Modules.Prescriptions.Domain;
using FSH.Modules.Prescriptions.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Prescriptions.Features.v1.Prescriptions.SearchPrescriptions;

public sealed class SearchPrescriptionsQueryHandler(
    PrescriptionsDbContext dbContext,
    PrescriptionNameResolver nameResolver,
    IMediator mediator)
    : IQueryHandler<SearchPrescriptionsQuery, PagedResponse<PrescriptionDto>>
{
    public async ValueTask<PagedResponse<PrescriptionDto>> Handle(SearchPrescriptionsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 50 : query.PageSize;

        var q = dbContext.Prescriptions.AsNoTracking().Include(p => p.Items).AsQueryable();

        if (query.CustomerId is { } customerId)
        {
            q = q.Where(p => p.CustomerId == customerId);
        }

        if (query.CreatedByUserId is { } createdByUserId)
        {
            q = q.Where(p => p.CreatedByUserId == createdByUserId);
        }

        if (query.Statuses is { Count: > 0 } statuses)
        {
            q = ApplyStatusFilter(q, statuses);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            // Matches the prescription number, the prescriber, or the patient (name, phone or email, resolved
            // through the Customers contract). Upper-cased Contains rather than ILIKE: EF translates it with
            // literal matching (% and _ are not wildcards) on Npgsql and it also runs on the in-memory provider.
            // The culture/comparison overloads the analyzers ask for do not translate.
            string term = query.Search.Trim();
            string upper = term.ToUpperInvariant();
            var customerIds = await FindCustomerIdsAsync(term, cancellationToken).ConfigureAwait(false);
#pragma warning disable CA1304, CA1311, CA1862
            q = q.Where(p =>
                p.PrescriptionNumber.ToUpper().Contains(upper) ||
                p.DoctorName.ToUpper().Contains(upper) ||
                customerIds.Contains(p.CustomerId));
#pragma warning restore CA1304, CA1311, CA1862
        }

        if (query.DateFrom is { } dateFrom)
        {
            q = q.Where(p => p.PrescriptionDate >= dateFrom);
        }

        if (query.DateTo is { } dateTo)
        {
            q = q.Where(p => p.PrescriptionDate <= dateTo);
        }

        q = q.OrderByDescending(p => p.PrescriptionDate);

        long total = await q.LongCountAsync(cancellationToken).ConfigureAwait(false);
        var prescriptions = await q
            .Skip((page - 1) * size)
            .Take(size)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var names = await nameResolver.ResolveAsync(prescriptions, cancellationToken).ConfigureAwait(false);

        return new PagedResponse<PrescriptionDto>
        {
            Items = prescriptions
                .Select(p => GetPrescriptionByIdQueryHandler.ToDto(p, names))
                .ToList(),
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size)
        };
    }

    /// <summary>
    /// Customers whose name, phone or email contains the term. Capped at one search page
    /// (<see cref="MaxCustomerMatches"/>); a broader term still matches by prescription number and prescriber.
    /// </summary>
    private async ValueTask<List<Guid>> FindCustomerIdsAsync(string term, CancellationToken cancellationToken)
    {
        var customers = await mediator
            .Send(new SearchCustomersQuery(Search: term, PageNumber: 1, PageSize: MaxCustomerMatches), cancellationToken)
            .ConfigureAwait(false);
        return customers.Items.Select(c => c.Id).ToList();
    }

    private const int MaxCustomerMatches = 200;

    /// <summary>
    /// Accepts any of: Active, Cancelled (stored status) and pending, partially_filled, filled (fill state,
    /// derived from item quantities as in the stats handler). Several values are OR-ed. Unknown values are
    /// ignored; if none are recognised no status filter applies.
    /// </summary>
    private static IQueryable<Prescription> ApplyStatusFilter(IQueryable<Prescription> q, IReadOnlyList<string> statuses)
    {
        var wanted = statuses
            .Select(s => s.Replace("_", string.Empty, StringComparison.Ordinal).ToUpperInvariant())
            .ToHashSet(StringComparer.Ordinal);

        bool active = wanted.Contains("ACTIVE");
        bool cancelled = wanted.Contains("CANCELLED");
        bool pending = wanted.Contains("PENDING");
        bool partiallyFilled = wanted.Contains("PARTIALLYFILLED");
        bool filled = wanted.Contains("FILLED");

        if (!(active || cancelled || pending || partiallyFilled || filled))
        {
            return q;
        }

        return q.Where(p =>
            (cancelled && p.Status == PrescriptionStatus.Cancelled)
            || (p.Status == PrescriptionStatus.Active && (
                active
                || (pending && p.Items.All(i => i.DispensedQuantity == 0))
                || (partiallyFilled
                    && p.Items.Any(i => i.DispensedQuantity > 0)
                    && p.Items.Any(i => i.DispensedQuantity < i.PrescribedQuantity))
                || (filled
                    && p.Items.Any()
                    && p.Items.All(i => i.DispensedQuantity >= i.PrescribedQuantity)))));
    }
}
