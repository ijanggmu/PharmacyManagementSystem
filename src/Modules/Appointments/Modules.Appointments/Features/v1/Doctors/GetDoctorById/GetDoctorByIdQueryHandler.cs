using FSH.Framework.Core.Exceptions;
using FSH.Modules.Appointments.Contracts.Dtos;
using FSH.Modules.Appointments.Contracts.v1.Doctors;
using FSH.Modules.Appointments.Data;
using FSH.Modules.Appointments.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Appointments.Features.v1.Doctors.GetDoctorById;

public sealed class GetDoctorByIdQueryHandler(AppointmentsDbContext dbContext)
    : IQueryHandler<GetDoctorByIdQuery, DoctorDto>
{
    public async ValueTask<DoctorDto> Handle(GetDoctorByIdQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var doctor = await dbContext.Doctors
            .AsNoTracking()
            .Include(d => d.WeeklySlots)
            .Include(d => d.DayChanges)
            .FirstOrDefaultAsync(d => d.Id == query.DoctorId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Doctor {query.DoctorId} not found.");

        return DoctorMapping.ToDto(doctor);
    }
}
