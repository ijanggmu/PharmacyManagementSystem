using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using Mediator;

namespace FSH.Modules.Sales.Features.v1.Shared;

/// <summary>
/// Batch lookups of the display data Sales stores only as ids — medicine labels from Inventory and
/// customer names from Customers — through their Contracts queries only (architecture.md). One query
/// per module per page, never per row.
/// </summary>
internal static class CrossModuleLookups
{
    /// <summary>How many customers a free-text search may resolve to before the sales filter stops widening.</summary>
    public const int MaxCustomerMatches = 500;

    public static async ValueTask<IReadOnlyDictionary<Guid, MedicineSummaryDto>> MedicinesAsync(
        IMediator mediator, IEnumerable<Guid> medicineIds, CancellationToken ct)
    {
        var ids = medicineIds.Where(id => id != Guid.Empty).Distinct().ToList();
        if (ids.Count == 0)
        {
            return new Dictionary<Guid, MedicineSummaryDto>();
        }

        var rows = await mediator.Send(new GetMedicineSummariesQuery(ids), ct).ConfigureAwait(false);
        return (rows ?? []).GroupBy(m => m.Id).ToDictionary(g => g.Key, g => g.First());
    }

    public static async ValueTask<IReadOnlyDictionary<Guid, CustomerLookupDto>> CustomersAsync(
        IMediator mediator, IEnumerable<Guid?> customerIds, CancellationToken ct)
    {
        var ids = customerIds.Where(id => id is { } v && v != Guid.Empty).Select(id => id!.Value).Distinct().ToList();
        if (ids.Count == 0)
        {
            return new Dictionary<Guid, CustomerLookupDto>();
        }

        var rows = await mediator.Send(new LookupCustomersQuery(ids, null, ids.Count), ct).ConfigureAwait(false);
        return (rows ?? []).GroupBy(c => c.Id).ToDictionary(g => g.Key, g => g.First());
    }

    /// <summary>Ids of customers whose name or phone contains <paramref name="search"/>.</summary>
    public static async ValueTask<List<Guid>> MatchingCustomerIdsAsync(
        IMediator mediator, string search, CancellationToken ct)
    {
        var rows = await mediator.Send(new LookupCustomersQuery(null, search, MaxCustomerMatches), ct).ConfigureAwait(false);
        return (rows ?? []).Select(c => c.Id).Distinct().ToList();
    }
}
