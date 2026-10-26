using FSH.Framework.Shared.Persistence;
using FSH.Modules.Appointments.Contracts.Dtos;
using FSH.Modules.Appointments.Contracts.v1.Doctors;
using FSH.Modules.Appointments.Data;
using FSH.Modules.Appointments.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Appointments.Features.v1.Doctors.SearchDoctors;

public sealed class SearchDoctorsQueryHandler(AppointmentsDbContext dbContext)
    : IQueryHandler<SearchDoctorsQuery, PagedResponse<DoctorDto>>
{
    public async ValueTask<PagedResponse<DoctorDto>> Handle(SearchDoctorsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 50 : query.PageSize;

        var q = dbContext.Doctors
            .AsNoTracking()
            .Include(d => d.WeeklySlots)
            .Include(d => d.DayChanges)
            .AsSplitQuery()
            .AsQueryable();

        if (!query.IncludeInactive)
        {
            q = q.Where(d => d.IsActive);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            // Upper-cased Contains, as in SearchPrescriptionsQueryHandler: literal matching on Npgsql and it runs on
            // the in-memory provider too. The culture/comparison overloads the analyzers ask for don't translate.
            string upper = query.Search.Trim().ToUpperInvariant();
#pragma warning disable CA1304, CA1311, CA1862
            q = q.Where(d =>
                d.Name.ToUpper().Contains(upper) ||
                (d.NmcNumber != null && d.NmcNumber.ToUpper().Contains(upper)) ||
                (d.Speciality != null && d.Speciality.ToUpper().Contains(upper)));
#pragma warning restore CA1304, CA1311, CA1862
        }

        q = q.OrderByDescending(d => d.IsActive).ThenBy(d => d.Name);

        long total = await q.LongCountAsync(cancellationToken).ConfigureAwait(false);
        var doctors = await q
            .Skip((page - 1) * size)
            .Take(size)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return new PagedResponse<DoctorDto>
        {
            Items = doctors.Select(DoctorMapping.ToDto).ToList(),
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size),
        };
    }
}
