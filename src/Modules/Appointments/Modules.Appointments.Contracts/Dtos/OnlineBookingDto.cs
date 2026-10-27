namespace FSH.Modules.Appointments.Contracts.Dtos;

/// <summary>The owner's online-booking switch and its limits. Off until the owner turns it on. <see cref="ListedOnExplore"/>
/// puts the pharmacy on the public "Find a doctor" page; it is only ever true while online booking is on.</summary>
public sealed record AppointmentSettingsDto(
    bool OnlineBookingEnabled,
    int BookingDaysAhead,
    int MaxBookingsPerPhonePerDay,
    bool ListedOnExplore = false);

/// <summary>Everything the public booking page shows: the pharmacy, its doctors and the sittings patients can book.
/// Only what a patient needs — no other patients, phone numbers or money owed.</summary>
public sealed record OnlineBookingPageDto(
    string PharmacyName,
    int BookingDaysAhead,
    IReadOnlyList<OnlineDoctorDto> Doctors,
    IReadOnlyList<OnlineSittingDto> Sittings);

public sealed record OnlineDoctorDto(Guid Id, string Name, string? Speciality, decimal Fee);

public sealed record OnlineSittingDto(
    Guid DoctorId,
    Guid BranchId,
    string? BranchName,
    DateOnly Date,
    TimeOnly StartTime,
    TimeOnly EndTime,
    int PlacesLeft);

/// <summary>The token a patient got online. <see cref="AlreadyBooked"/> is true when this phone already had a token
/// in that sitting — the same token is shown again rather than a second one taken.</summary>
public sealed record OnlineTokenDto(
    int TokenNo,
    string DoctorName,
    string? BranchName,
    DateOnly Date,
    TimeOnly StartTime,
    TimeOnly EndTime,
    string PatientName,
    bool AlreadyBooked);
