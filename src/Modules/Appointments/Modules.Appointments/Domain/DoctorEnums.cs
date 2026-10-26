namespace FSH.Modules.Appointments.Domain;

public enum DoctorShareType
{
    /// <summary>The doctor gets <c>ShareValue</c> percent of each fee.</summary>
    Percent = 0,

    /// <summary>The doctor gets <c>ShareValue</c> rupees of each fee.</summary>
    Fixed = 1,
}

public enum DoctorDayChangeKind
{
    /// <summary>The doctor is not coming on that date: every weekly sitting that date is dropped.</summary>
    DayOff = 0,

    /// <summary>The doctor sits on that date outside the weekly days.</summary>
    ExtraDay = 1,
}
