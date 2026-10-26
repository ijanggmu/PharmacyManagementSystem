using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Appointments.Domain;

/// <summary>
/// A visiting doctor who sits at the pharmacy on set days. Belongs to the whole pharmacy; each weekly sitting
/// (<see cref="DoctorWeeklySlot"/>) names the branch it is at. <see cref="DoctorDayChange"/>s change single dates.
/// </summary>
public sealed class Doctor : AggregateRoot<Guid>
{
    public const int MaxTokensPerSitting = 500;

    private readonly List<DoctorWeeklySlot> _weeklySlots = [];
    private readonly List<DoctorDayChange> _dayChanges = [];

    public string Name { get; private set; } = default!;

    /// <summary>The doctor's Nepal Medical Council registration number; unique per pharmacy when set.</summary>
    public string? NmcNumber { get; private set; }
    public string? Speciality { get; private set; }
    public string? Phone { get; private set; }

    /// <summary>Consultation fee the patient pays, in rupees.</summary>
    public decimal Fee { get; private set; }
    public DoctorShareType ShareType { get; private set; }
    public decimal ShareValue { get; private set; }
    public bool IsActive { get; private set; } = true;
    public DateTime CreatedAtUtc { get; private set; }

    /// <summary>Optimistic-concurrency token, mapped to Postgres' <c>xmin</c>.</summary>
    public uint RowVersion { get; }

    public IReadOnlyList<DoctorWeeklySlot> WeeklySlots => _weeklySlots;
    public IReadOnlyList<DoctorDayChange> DayChanges => _dayChanges;

    private Doctor() { }

    public static Doctor Create(
        string name, string? nmcNumber, string? speciality, string? phone,
        decimal fee, DoctorShareType shareType, decimal shareValue, DateTime createdAtUtc)
    {
        var doctor = new Doctor { Id = Guid.CreateVersion7(), CreatedAtUtc = createdAtUtc };
        doctor.Update(name, nmcNumber, speciality, phone, fee, shareType, shareValue);
        return doctor;
    }

    public void Update(
        string name, string? nmcNumber, string? speciality, string? phone,
        decimal fee, DoctorShareType shareType, decimal shareValue)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        EnsureShareFits(fee, shareType, shareValue);

        Name = name.Trim();
        NmcNumber = NormalizeOptional(nmcNumber);
        Speciality = NormalizeOptional(speciality);
        Phone = NormalizeOptional(phone);
        Fee = fee;
        ShareType = shareType;
        ShareValue = shareValue;
    }

    public void SetActive(bool isActive) => IsActive = isActive;

    /// <summary>The doctor's part of one <see cref="Fee"/>, rounded to the paisa.</summary>
    public decimal DoctorShareAmount() => ShareOf(Fee, ShareType, ShareValue);

    internal static decimal ShareOf(decimal fee, DoctorShareType shareType, decimal shareValue) => shareType switch
    {
        DoctorShareType.Percent => Math.Round(fee * shareValue / 100m, 2, MidpointRounding.AwayFromZero),
        _ => Math.Min(shareValue, fee),
    };

    /// <summary>Replaces every weekly sitting. Two sittings of the same doctor may not overlap on the same weekday,
    /// even at different branches: the doctor can't be in two places at once.</summary>
    public void SetWeeklySlots(IReadOnlyList<WeeklySlotSpec> slots)
    {
        ArgumentNullException.ThrowIfNull(slots);

        var created = slots
            .Select(s => DoctorWeeklySlot.Create(Id, s.BranchId, s.Day, s.Start, s.End, s.MaxTokens))
            .ToList();

        foreach (var group in created.GroupBy(s => s.DayOfWeek))
        {
            var ordered = group.OrderBy(s => s.StartTime).ToList();
            for (int i = 1; i < ordered.Count; i++)
            {
                if (ordered[i].StartTime < ordered[i - 1].EndTime)
                {
                    throw BadRequest($"Two sittings on {group.Key} overlap. Change the times so one ends before the next starts.");
                }
            }
        }

        _weeklySlots.Clear();
        _weeklySlots.AddRange(created);
    }

    /// <summary>
    /// Adds a day change for <paramref name="date"/> (today or later). A date has at most one day off, never both a
    /// day off and an extra day, and an extra day may not overlap a weekly sitting or another extra day that date.
    /// </summary>
    public DoctorDayChange AddDayChange(
        DateOnly date, DoctorDayChangeKind kind, Guid? branchId, TimeOnly? start, TimeOnly? end, int? maxTokens,
        string? note, DateOnly today)
    {
        if (date < today)
        {
            throw BadRequest("Pick today or a later date.");
        }

        var sameDate = _dayChanges.Where(c => c.Date == date).ToList();
        if (kind == DoctorDayChangeKind.DayOff)
        {
            if (sameDate.Count > 0)
            {
                throw BadRequest(sameDate.Exists(c => c.Kind == DoctorDayChangeKind.DayOff)
                    ? "This date is already marked as a day off."
                    : "This date has an extra day. Remove it before marking the date as a day off.");
            }
        }
        else
        {
            if (sameDate.Exists(c => c.Kind == DoctorDayChangeKind.DayOff))
            {
                throw BadRequest("This date is marked as a day off. Remove the day off before adding an extra day.");
            }

            if (start is { } s && end is { } e && OverlapsSitting(date, s, e, sameDate))
            {
                throw BadRequest("The extra day overlaps another sitting on that date.");
            }
        }

        var change = DoctorDayChange.Create(Id, date, kind, branchId, start, end, maxTokens, note);
        _dayChanges.Add(change);
        return change;
    }

    public void RemoveDayChange(Guid dayChangeId)
    {
        var change = _dayChanges.Find(c => c.Id == dayChangeId)
            ?? throw new NotFoundException($"Day change {dayChangeId} not found.");
        _dayChanges.Remove(change);
    }

    private bool OverlapsSitting(DateOnly date, TimeOnly start, TimeOnly end, List<DoctorDayChange> sameDateChanges)
    {
        var weekly = _weeklySlots
            .Where(w => w.DayOfWeek == date.DayOfWeek)
            .Select(w => (w.StartTime, w.EndTime));
        var extras = sameDateChanges
            .Where(c => c.StartTime is not null && c.EndTime is not null)
            .Select(c => (StartTime: c.StartTime!.Value, EndTime: c.EndTime!.Value));
        return weekly.Concat(extras).Any(x => start < x.EndTime && x.StartTime < end);
    }

    private static void EnsureShareFits(decimal fee, DoctorShareType shareType, decimal shareValue)
    {
        if (fee < 0)
        {
            throw BadRequest("The fee can't be below zero.");
        }

        if (shareValue < 0)
        {
            throw BadRequest("The doctor's share can't be below zero.");
        }

        if (shareType == DoctorShareType.Percent && shareValue > 100)
        {
            throw BadRequest("The doctor's share can't be more than 100%.");
        }

        if (shareType == DoctorShareType.Fixed && shareValue > fee)
        {
            throw BadRequest("The doctor's share can't be more than the fee.");
        }
    }

    internal static CustomException BadRequest(string message) =>
        new(message, (IEnumerable<string>?)null, HttpStatusCode.BadRequest);

    internal static string? NormalizeOptional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

/// <summary>Input for <see cref="Doctor.SetWeeklySlots"/>: one weekly sitting.</summary>
public sealed record WeeklySlotSpec(Guid BranchId, DayOfWeek Day, TimeOnly Start, TimeOnly End, int MaxTokens);
