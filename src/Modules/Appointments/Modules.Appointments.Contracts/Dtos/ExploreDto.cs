namespace FSH.Modules.Appointments.Contracts.Dtos;

/// <summary>The public "Find a doctor" page: the doctors of every pharmacy that chose to be listed, each with the
/// sittings a patient can book online. Only what a patient needs to choose — no phone numbers, NMC numbers,
/// patients or money owed.</summary>
public sealed record ExploreDto(IReadOnlyList<ExploreDoctorDto> Doctors);

/// <summary>One doctor at one pharmacy. <see cref="PharmacyCode"/> is the code the booking link takes.</summary>
public sealed record ExploreDoctorDto(
    string PharmacyCode,
    string PharmacyName,
    Guid DoctorId,
    string Name,
    string? Speciality,
    decimal Fee,
    IReadOnlyList<ExploreSittingDto> Sittings);

public sealed record ExploreSittingDto(
    DateOnly Date,
    TimeOnly StartTime,
    TimeOnly EndTime,
    string? BranchName,
    string? BranchAddress,
    int PlacesLeft);
