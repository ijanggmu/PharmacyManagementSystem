using FSH.Modules.Appointments.Contracts.Dtos;
using FSH.Modules.Appointments.Services;

namespace Appointments.Tests.Services;

public sealed class OnlineBookingTests
{
    [Theory]
    [InlineData("9812345678", "9812345678")]
    [InlineData(" 981-234-5678 ", "9812345678")]
    [InlineData("+977 9801234567", "9801234567")]
    [InlineData("9779741234567", "9741234567")]
    [InlineData("00977 (976) 123 4567", "9761234567")]
    [InlineData("9612345678", "9612345678")]
    [InlineData("981234567", null)]
    [InlineData("98123456789", null)]
    [InlineData("9512345678", null)]
    [InlineData("014412345", null)]
    [InlineData("98123x5678", null)]
    [InlineData("98+12345678", null)]
    [InlineData("", null)]
    [InlineData(null, null)]
    public void Only_nepali_mobile_numbers_pass(string? input, string? expected) =>
        OnlineBooking.NormalizeMobile(input).ShouldBe(expected);

    [Fact]
    public void Days_ahead_counts_today_as_day_zero()
    {
        var today = new DateOnly(2026, 11, 1);
        OnlineBooking.LastBookableDate(today, 0).ShouldBe(today);
        OnlineBooking.LastBookableDate(today, 7).ShouldBe(new DateOnly(2026, 11, 8));
    }

    [Fact]
    public void Bookable_keeps_timetable_sittings_not_yet_over_and_full_ones_with_no_places()
    {
        var doctor = Guid.NewGuid();
        var today = new DateOnly(2026, 11, 1);
        TimetableSessionDto Sitting(DateOnly date, int start, int max = 5, int booked = 0) =>
            new(doctor, "Dr", null, Guid.Empty, date, new TimeOnly(start, 0), new TimeOnly(start + 2, 0), max, false, booked);

        var morning = Sitting(today, 8);
        var evening = Sitting(today, 16, max: 2, booked: 2);
        var tomorrow = Sitting(today.AddDays(1), 8);
        var removed = Sitting(today.AddDays(2), 8, booked: 1); // saved with patients, no longer in the timetable
        var calendar = new TimetableDto(today, today.AddDays(2), [morning, evening, tomorrow], []);
        var board = calendar with { Sessions = [morning, evening, tomorrow, removed] };

        var bookable = OnlineBooking.Bookable(board, calendar, today, new TimeOnly(11, 0));

        bookable.ShouldBe([evening, tomorrow]);
        OnlineBooking.PlacesLeft(evening).ShouldBe(0);
        OnlineBooking.PlacesLeft(tomorrow).ShouldBe(5);
    }
}
