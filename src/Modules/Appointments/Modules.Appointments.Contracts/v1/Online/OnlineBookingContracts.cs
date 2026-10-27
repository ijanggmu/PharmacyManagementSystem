using FSH.Modules.Appointments.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Appointments.Contracts.v1.Online;

public sealed record GetAppointmentSettingsQuery : IQuery<AppointmentSettingsDto>;

public sealed record UpdateAppointmentSettingsCommand(
    bool OnlineBookingEnabled,
    int BookingDaysAhead,
    int MaxBookingsPerPhonePerDay,
    bool ListedOnExplore = false) : ICommand<AppointmentSettingsDto>;

/// <summary>Anonymous: the public booking page of the pharmacy the request's tenant names. Not found while online
/// booking is off.</summary>
public sealed record GetOnlineBookingPageQuery : IQuery<OnlineBookingPageDto>;

/// <summary>Anonymous: a patient books the next token in a sitting from the public page. The phone must be a Nepali
/// mobile number; the fee is paid at the counter on arrival.</summary>
public sealed record BookOnlineTokenCommand(
    Guid DoctorId,
    DateOnly Date,
    TimeOnly StartTime,
    string PatientName,
    string PatientPhone) : ICommand<OnlineTokenDto>;
