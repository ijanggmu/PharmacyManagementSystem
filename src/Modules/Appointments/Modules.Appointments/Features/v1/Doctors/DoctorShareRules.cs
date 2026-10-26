using FSH.Modules.Appointments.Contracts.Dtos;

namespace FSH.Modules.Appointments.Features.v1.Doctors;

internal static class DoctorShareRules
{
    public static bool IsKnown(string? shareType) =>
        Is(shareType, DoctorShareTypes.Percent) || Is(shareType, DoctorShareTypes.Fixed);

    public static bool Is(string? shareType, string expected) =>
        string.Equals(shareType, expected, StringComparison.OrdinalIgnoreCase);
}
