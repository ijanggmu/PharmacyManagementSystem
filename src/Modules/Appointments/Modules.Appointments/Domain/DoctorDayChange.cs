using FSH.Framework.Core.Domain;

namespace FSH.Modules.Appointments.Domain;

/// <summary>
/// A change to one date of the doctor's weekly days: a day off, or an extra sitting. Branch, times and tokens are
/// set only for an extra day. Reached only through <see cref="Doctor.DayChanges"/> (needs <c>ValueGeneratedNever()</c>).
/// </summary>
public sealed class DoctorDayChange : BaseEntity<Guid>
{
    public Guid DoctorId { get; private set; }
    public DateOnly Date { get; private set; }
    public DoctorDayChangeKind Kind { get; private set; }
    public Guid? BranchId { get; private set; }
    public TimeOnly? StartTime { get; private set; }
    public TimeOnly? EndTime { get; private set; }
    public int? MaxTokens { get; private set; }

    /// <summary>Why, in the owner's words (e.g. "Doctor on leave"). Max 256 characters.</summary>
    public string? Note { get; private set; }

    private DoctorDayChange() { }

    internal static DoctorDayChange Create(
        Guid doctorId, DateOnly date, DoctorDayChangeKind kind, Guid? branchId, TimeOnly? start, TimeOnly? end,
        int? maxTokens, string? note)
    {
        var change = new DoctorDayChange
        {
            Id = Guid.CreateVersion7(),
            DoctorId = doctorId,
            Date = date,
            Kind = kind,
            Note = Doctor.NormalizeOptional(note),
        };

        if (kind == DoctorDayChangeKind.ExtraDay)
        {
            if (branchId is null || branchId == Guid.Empty || start is null || end is null || maxTokens is null)
            {
                throw Doctor.BadRequest("An extra day needs the branch, start time, end time and patients per sitting.");
            }

            DoctorWeeklySlot.EnsureTimes(start.Value, end.Value, maxTokens.Value);
            change.BranchId = branchId;
            change.StartTime = start;
            change.EndTime = end;
            change.MaxTokens = maxTokens;
        }

        return change;
    }
}
