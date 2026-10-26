using FSH.Framework.Shared.Persistence;
using FSH.Modules.Appointments.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Appointments.Contracts.v1.Appointments;

public sealed record GetAppointmentByIdQuery(Guid AppointmentId) : IQuery<AppointmentDto>;

/// <summary>Every sitting on <see cref="Date"/> with its tokens. A caller who can't see every branch only gets their
/// own branch.</summary>
public sealed record GetDaySheetQuery(DateOnly Date, Guid? BranchId = null) : IQuery<DaySheetDto>;

/// <summary>Paged appointment history, newest date first. <see cref="Search"/> matches the patient's name or phone.</summary>
public sealed record SearchAppointmentsQuery(
    string? Search = null,
    Guid? DoctorId = null,
    string? Status = null,
    DateOnly? DateFrom = null,
    DateOnly? DateTo = null,
    int PageNumber = 1,
    int PageSize = 50) : IQuery<PagedResponse<AppointmentDto>>;

/// <summary>
/// Net cash the doctors' desk put into <see cref="BranchId"/>'s drawer between <see cref="FromUtc"/> and
/// <see cref="ToUtc"/>: consultation fees taken in cash, less cash fees given back and doctors paid in cash. Sales adds
/// it to the drawer's expected cash.
/// </summary>
public sealed record GetAppointmentDrawerCashQuery(Guid BranchId, DateTime FromUtc, DateTime ToUtc) : IQuery<decimal>;
