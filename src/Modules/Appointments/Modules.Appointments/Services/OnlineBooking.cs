using System.Text;
using FSH.Modules.Appointments.Contracts.Dtos;
using FSH.Modules.Appointments.Data;
using FSH.Modules.Appointments.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Appointments.Services;

/// <summary>The rules of the public booking page, kept pure where they can be so they are unit-tested.</summary>
internal static class OnlineBooking
{
    /// <summary>Rate-limit policy on the anonymous booking endpoint: a few bookings per pharmacy and IP address.</summary>
    public const string RateLimitPolicy = "online-booking";
    public const int RateLimitPermits = 10;
    public static readonly TimeSpan RateLimitWindow = TimeSpan.FromMinutes(10);

    /// <summary>Rate-limit policy on the anonymous Explore page: generous, per IP address (the page is cached).</summary>
    public const string ExploreRateLimitPolicy = "appointments-explore";
    public const int ExploreRateLimitPermits = 60;
    public static readonly TimeSpan ExploreRateLimitWindow = TimeSpan.FromMinutes(1);

    /// <summary>
    /// A Nepali mobile number as 10 digits (98…, 97…, 96…), or null when it isn't one. Spaces, dashes, dots and
    /// brackets are ignored, as are a leading +977 / 977 / 00977.
    /// </summary>
    public static string? NormalizeMobile(string? phone)
    {
        if (string.IsNullOrWhiteSpace(phone))
        {
            return null;
        }

        var digits = new StringBuilder(phone.Length);
        foreach (char c in phone.Trim())
        {
            if (char.IsAsciiDigit(c))
            {
                digits.Append(c);
            }
            else if (c is not (' ' or '-' or '.' or '(' or ')') && !(c == '+' && digits.Length == 0))
            {
                return null;
            }
        }

        string number = digits.ToString();
        if (number.StartsWith("00977", StringComparison.Ordinal))
        {
            number = number[5..];
        }
        else if (number.StartsWith("977", StringComparison.Ordinal) && number.Length == 13)
        {
            number = number[3..];
        }

        return number.Length == 10 && number[0] == '9' && number[1] is '6' or '7' or '8' ? number : null;
    }

    /// <summary>The last date patients may book online, counting today as day 0.</summary>
    public static DateOnly LastBookableDate(DateOnly today, int daysAhead) => today.AddDays(Math.Max(0, daysAhead));

    /// <summary>
    /// The sittings a patient can see: in the doctors' timetable (not a saved sitting whose weekly day was removed),
    /// of an active doctor, and not over yet. Full sittings stay, with no places left, so the patient sees "Full".
    /// </summary>
    public static IReadOnlyList<TimetableSessionDto> Bookable(
        TimetableDto board, TimetableDto calendar, DateOnly today, TimeOnly nowTime)
    {
        ArgumentNullException.ThrowIfNull(board);
        ArgumentNullException.ThrowIfNull(calendar);
        var inTimetable = calendar.Sessions.Select(s => (s.DoctorId, s.Date, s.StartTime)).ToHashSet();
        return board.Sessions
            .Where(s => inTimetable.Contains((s.DoctorId, s.Date, s.StartTime)))
            .Where(s => s.Date > today || (s.Date == today && nowTime < s.EndTime))
            .ToList();
    }

    public static int PlacesLeft(TimetableSessionDto sitting)
    {
        ArgumentNullException.ThrowIfNull(sitting);
        return Math.Max(0, sitting.MaxTokens - sitting.Booked);
    }

    /// <summary>The settings saved for this pharmacy, or the defaults (online booking off) when none were saved.</summary>
    public static async Task<AppointmentSettings> LoadSettingsAsync(
        AppointmentsDbContext dbContext, bool track, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        var query = track ? dbContext.AppointmentSettings : dbContext.AppointmentSettings.AsNoTracking();
        return await query.FirstOrDefaultAsync(s => s.Key == AppointmentSettings.DefaultKey, ct).ConfigureAwait(false)
            ?? AppointmentSettings.Defaults();
    }

    public static AppointmentSettingsDto ToDto(AppointmentSettings settings)
    {
        ArgumentNullException.ThrowIfNull(settings);
        return new AppointmentSettingsDto(
            settings.OnlineBookingEnabled, settings.BookingDaysAhead, settings.MaxBookingsPerPhonePerDay, settings.ListedOnExplore);
    }
}
