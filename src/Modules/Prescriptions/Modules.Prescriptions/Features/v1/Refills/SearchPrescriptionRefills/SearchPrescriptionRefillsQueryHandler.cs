using FSH.Framework.Shared.Persistence;
using FSH.Modules.Prescriptions.Contracts.Dtos;
using FSH.Modules.Prescriptions.Contracts.v1.Refills;
using FSH.Modules.Prescriptions.Data;
using FSH.Modules.Prescriptions.Domain;
using FSH.Modules.Prescriptions.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Prescriptions.Features.v1.Refills.SearchPrescriptionRefills;

public sealed class SearchPrescriptionRefillsQueryHandler(PrescriptionsDbContext dbContext, PrescriptionNameResolver nameResolver)
    : IQueryHandler<SearchPrescriptionRefillsQuery, PagedResponse<PrescriptionRefillDto>>
{
    public async ValueTask<PagedResponse<PrescriptionRefillDto>> Handle(
        SearchPrescriptionRefillsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 50 : query.PageSize;

        var q = dbContext.PrescriptionRefills.AsNoTracking().AsQueryable();

        if (query.PrescriptionId is { } prescriptionId)
        {
            q = q.Where(r => r.PrescriptionId == prescriptionId);
        }

        if (query.MedicineId is { } medicineId)
        {
            q = q.Where(r => r.MedicineId == medicineId);
        }

        if (query.DateFrom is { } dateFrom)
        {
            q = q.Where(r => r.RefilledAtUtc >= dateFrom);
        }

        if (query.DateTo is { } dateTo)
        {
            q = q.Where(r => r.RefilledAtUtc <= dateTo);
        }

        if (query.CustomerId is { } customerId)
        {
            var prescriptionIds = dbContext.Prescriptions
                .AsNoTracking()
                .Where(p => p.CustomerId == customerId)
                .Select(p => p.Id);
            q = q.Where(r => prescriptionIds.Contains(r.PrescriptionId));
        }

        q = q.OrderByDescending(r => r.RefilledAtUtc);

        long total = await q.LongCountAsync(cancellationToken).ConfigureAwait(false);
        var refills = await q
            .Skip((page - 1) * size)
            .Take(size)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var prescriptions = await dbContext.Prescriptions
            .AsNoTracking()
            .Where(p => refills.Select(r => r.PrescriptionId).Distinct().Contains(p.Id))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        var prescriptionsById = prescriptions.ToDictionary(p => p.Id);

        var names = await nameResolver.ResolveAsync(prescriptions, cancellationToken).ConfigureAwait(false);

        return new PagedResponse<PrescriptionRefillDto>
        {
            Items = refills
                .Where(r => prescriptionsById.ContainsKey(r.PrescriptionId))
                .Select(r => ToDto(r, prescriptionsById[r.PrescriptionId], names))
                .ToList(),
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size)
        };
    }

    internal static PrescriptionRefillDto ToDto(PrescriptionRefill refill, Prescription prescription, PrescriptionNames names) =>
        new(
            refill.Id,
            prescription.Id,
            prescription.PrescriptionNumber,
            prescription.CustomerId,
            names.CustomerName(prescription.CustomerId),
            refill.PrescriptionItemId,
            refill.MedicineId,
            names.MedicineName(refill.MedicineId),
            refill.QuantityDispensed,
            refill.RefilledAtUtc,
            refill.DispensedByUserId,
            refill.Notes);
}
