using FSH.Framework.Shared.Constants;

namespace FSH.Modules.Appointments.Contracts.Authorization;

public static class AppointmentsPermissions
{
    /// <summary>The visiting doctors, their weekly days and day changes, and the timetable built from them.</summary>
    public static class Doctors
    {
        public const string Resource = "Appointments.Doctors";
        public const string View = $"Permissions.{Resource}.View";
        public const string Manage = $"Permissions.{Resource}.Manage";
    }

    public static IReadOnlyList<FshPermission> All { get; } =
    [
        new("View Doctors", ActionConstants.View, Doctors.Resource),
        new("Manage Doctors", "Manage", Doctors.Resource),
    ];
}
