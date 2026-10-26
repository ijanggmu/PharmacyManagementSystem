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

    /// <summary>Patients' tokens: booking one, and moving it along on the day (arrived and fee taken, seen, didn't
    /// come, cancelled).</summary>
    public static class Appointments
    {
        public const string Resource = "Appointments.Appointments";
        public const string View = $"Permissions.{Resource}.View";
        public const string Book = $"Permissions.{Resource}.Book";
        public const string CheckIn = $"Permissions.{Resource}.CheckIn";
    }

    /// <summary>What the pharmacy owes each doctor from the fees it collected, and paying it out.</summary>
    public static class Payouts
    {
        public const string Resource = "Appointments.Payouts";
        public const string View = $"Permissions.{Resource}.View";
        public const string Pay = $"Permissions.{Resource}.Pay";
    }

    public static IReadOnlyList<FshPermission> All { get; } =
    [
        new("View Doctors", ActionConstants.View, Doctors.Resource),
        new("Manage Doctors", "Manage", Doctors.Resource),

        new("View Appointments", ActionConstants.View, Appointments.Resource),
        new("Book Appointments", "Book", Appointments.Resource),
        new("Check In Appointments", "CheckIn", Appointments.Resource),

        new("View Doctor Payouts", ActionConstants.View, Payouts.Resource),
        new("Pay Doctors", "Pay", Payouts.Resource),
    ];
}
