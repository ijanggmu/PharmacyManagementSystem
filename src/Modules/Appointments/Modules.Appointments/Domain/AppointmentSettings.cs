using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Appointments.Domain;

/// <summary>
/// The pharmacy's online-booking switch: whether patients may book tokens from the public page, how many days ahead,
/// how many tokens one phone may take a day, and whether the pharmacy is listed on the public "Find a doctor" page.
/// One row per pharmacy (<see cref="Key"/> is unique per tenant); a
/// pharmacy without a row has online booking off.
/// </summary>
public sealed class AppointmentSettings : AggregateRoot<Guid>
{
    public const string DefaultKey = "default";
    public const int DefaultDaysAhead = 7;
    public const int DefaultBookingsPerPhone = 2;
    public const int MaxDaysAheadLimit = 60;
    public const int MaxBookingsPerPhoneLimit = 10;

    public string Key { get; private set; } = DefaultKey;
    public bool OnlineBookingEnabled { get; private set; }
    public int BookingDaysAhead { get; private set; } = DefaultDaysAhead;
    public int MaxBookingsPerPhonePerDay { get; private set; } = DefaultBookingsPerPhone;

    /// <summary>Listed on the public Explore page. Only while online booking is on — turning that off unlists too.</summary>
    public bool ListedOnExplore { get; private set; }

    private AppointmentSettings() { }

    /// <summary>What a pharmacy that never saved its settings has: online booking off, the defaults otherwise.</summary>
    public static AppointmentSettings Defaults() => new() { Id = Guid.CreateVersion7() };

    public void Update(bool onlineBookingEnabled, int bookingDaysAhead, int maxBookingsPerPhonePerDay, bool listedOnExplore = false)
    {
        if (bookingDaysAhead is < 0 or > MaxDaysAheadLimit)
        {
            throw BadRequest($"Patients can book from today up to {MaxDaysAheadLimit} days ahead.");
        }

        if (maxBookingsPerPhonePerDay is < 1 or > MaxBookingsPerPhoneLimit)
        {
            throw BadRequest($"Allow 1 to {MaxBookingsPerPhoneLimit} tokens per phone a day.");
        }

        OnlineBookingEnabled = onlineBookingEnabled;
        BookingDaysAhead = bookingDaysAhead;
        MaxBookingsPerPhonePerDay = maxBookingsPerPhonePerDay;
        ListedOnExplore = onlineBookingEnabled && listedOnExplore;
    }

    private static CustomException BadRequest(string message) =>
        new(message, (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
}
