using FSH.Framework.Core.Domain;

namespace FSH.Modules.Appointments.Domain;

/// <summary>
/// One weekly sitting: the doctor sits at <see cref="BranchId"/> every <see cref="DayOfWeek"/> from
/// <see cref="StartTime"/> to <see cref="EndTime"/> (Nepal time), seeing up to <see cref="MaxTokens"/> patients.
/// Reached only through <see cref="Doctor.WeeklySlots"/> (needs <c>ValueGeneratedNever()</c>; database.md).
/// </summary>
public sealed class DoctorWeeklySlot : BaseEntity<Guid>
{
    public Guid DoctorId { get; private set; }
    public Guid BranchId { get; private set; }
    public DayOfWeek DayOfWeek { get; private set; }
    public TimeOnly StartTime { get; private set; }
    public TimeOnly EndTime { get; private set; }
    public int MaxTokens { get; private set; }

    private DoctorWeeklySlot() { }

    internal static DoctorWeeklySlot Create(
        Guid doctorId, Guid branchId, DayOfWeek dayOfWeek, TimeOnly start, TimeOnly end, int maxTokens)
    {
        if (branchId == Guid.Empty)
        {
            throw Doctor.BadRequest("Pick the branch for each sitting.");
        }

        if (!Enum.IsDefined(dayOfWeek))
        {
            throw Doctor.BadRequest("Pick a day of the week.");
        }

        EnsureTimes(start, end, maxTokens);

        return new DoctorWeeklySlot
        {
            Id = Guid.CreateVersion7(),
            DoctorId = doctorId,
            BranchId = branchId,
            DayOfWeek = dayOfWeek,
            StartTime = start,
            EndTime = end,
            MaxTokens = maxTokens,
        };
    }

    internal static void EnsureTimes(TimeOnly start, TimeOnly end, int maxTokens)
    {
        if (end <= start)
        {
            throw Doctor.BadRequest("The end time must be after the start time.");
        }

        if (maxTokens is < 1 or > Doctor.MaxTokensPerSitting)
        {
            throw Doctor.BadRequest($"Patients per sitting must be between 1 and {Doctor.MaxTokensPerSitting}.");
        }
    }
}
