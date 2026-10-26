using FSH.Framework.Shared.Persistence;
using FSH.Modules.Appointments.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Appointments.Contracts.v1.Doctors;

public sealed record GetDoctorByIdQuery(Guid DoctorId) : IQuery<DoctorDto>;

/// <summary>Paged doctor list. <see cref="Search"/> matches the name, NMC number or speciality. Stopped doctors are
/// left out unless <see cref="IncludeInactive"/>.</summary>
public sealed record SearchDoctorsQuery(
    string? Search = null,
    bool IncludeInactive = false,
    int PageNumber = 1,
    int PageSize = 50) : IQuery<PagedResponse<DoctorDto>>;
