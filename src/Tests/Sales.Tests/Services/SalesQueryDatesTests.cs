using FSH.Modules.Sales.Services;
using Shouldly;
using Xunit;

namespace Sales.Tests.Services;

/// <summary>
/// <see cref="SalesQueryDates"/>: <c>?fromUtc=2026-10-01</c> on a Sales report (IRD sales register, summaries) reaches
/// the handler as the Nepal business day's UTC bounds instead of an Unspecified <see cref="DateTime"/> (a 500 in Npgsql).
/// </summary>
public sealed class SalesQueryDatesTests
{
    private static readonly DateTime DateOnlyValue = new(2026, 10, 1, 0, 0, 0, DateTimeKind.Unspecified);

    [Fact]
    public void Normalize_Should_Map_ADateOnly_To_TheNepalDaysBounds()
    {
        var from = SalesQueryDates.Normalize(DateOnlyValue, upperBound: false);
        var to = SalesQueryDates.Normalize(DateOnlyValue, upperBound: true);

        from.ShouldBe(new DateTime(2026, 9, 30, 18, 15, 0, DateTimeKind.Utc));
        from.Kind.ShouldBe(DateTimeKind.Utc);
        to.ShouldBe(new DateTime(2026, 10, 1, 18, 15, 0, DateTimeKind.Utc).AddTicks(-TimeSpan.TicksPerMicrosecond));
        to.Kind.ShouldBe(DateTimeKind.Utc);
    }

    [Fact]
    public void Normalize_Should_TreatAZonelessTime_AsUtc_And_ConvertOffsets()
    {
        var zoneless = new DateTime(2026, 10, 1, 9, 30, 0, DateTimeKind.Unspecified);

        SalesQueryDates.Normalize(zoneless, upperBound: false)
            .ShouldBe(new DateTime(2026, 10, 1, 9, 30, 0, DateTimeKind.Utc));
        SalesQueryDates.Normalize(new DateTime(2026, 10, 1, 9, 30, 0, DateTimeKind.Utc), upperBound: true).Kind
            .ShouldBe(DateTimeKind.Utc);
    }

    [Theory]
    [InlineData("toUtc", true)]
    [InlineData("periodEndUtc", true)]
    [InlineData("periodStartUtc", false)]
    [InlineData("dateToUtc", true)]
    [InlineData("asOfUtc", true)]
    [InlineData("fromUtc", false)]
    public void IsUpperBound_Should_RecogniseRangeEnds(string name, bool expected) =>
        SalesQueryDates.IsUpperBound(name).ShouldBe(expected);
}
