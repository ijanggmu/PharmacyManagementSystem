using FSH.Modules.Purchasing.Services;
using Microsoft.AspNetCore.Http;

namespace Purchasing.Tests.Features;

/// <summary>
/// <see cref="PurchasingQueryDates"/>: date-only and zoneless query dates reach the handlers as UTC — a date as the
/// Nepal business day's bounds — instead of an Unspecified <see cref="DateTime"/> that Npgsql refuses (500).
/// </summary>
public sealed class PurchasingQueryDatesTests
{
    private static readonly DateTime DateOnlyValue = new(2026, 10, 1, 0, 0, 0, DateTimeKind.Unspecified);

    public sealed class SearchQuery
    {
        public DateTime? DateFromUtc { get; set; }
        public DateTime? DateToUtc { get; set; }
        public int PageNumber { get; set; }
    }

    [Fact]
    public void Normalize_Should_Map_ADateOnly_To_TheNepalDaysBounds()
    {
        var from = PurchasingQueryDates.Normalize(DateOnlyValue, upperBound: false);
        var to = PurchasingQueryDates.Normalize(DateOnlyValue, upperBound: true);

        from.ShouldBe(new DateTime(2026, 9, 30, 18, 15, 0, DateTimeKind.Utc));
        from.Kind.ShouldBe(DateTimeKind.Utc);
        to.ShouldBe(new DateTime(2026, 10, 1, 18, 15, 0, DateTimeKind.Utc).AddTicks(-TimeSpan.TicksPerMicrosecond));
        to.ShouldBeLessThan(new DateTime(2026, 10, 1, 18, 15, 0, DateTimeKind.Utc));
    }

    [Fact]
    public void Normalize_Should_TreatAZonelessTime_AsUtc_And_KeepUtc()
    {
        var zoneless = new DateTime(2026, 10, 1, 9, 30, 0, DateTimeKind.Unspecified);
        var utc = new DateTime(2026, 10, 1, 9, 30, 0, DateTimeKind.Utc);

        var normalized = PurchasingQueryDates.Normalize(zoneless, upperBound: true);
        normalized.ShouldBe(utc);
        normalized.Kind.ShouldBe(DateTimeKind.Utc);
        PurchasingQueryDates.Normalize(utc, upperBound: false).ShouldBe(utc);
        PurchasingQueryDates.Normalize(utc.ToLocalTime(), upperBound: false).ShouldBe(utc);
    }

    [Theory]
    [InlineData("toUtc", true)]
    [InlineData("DateToUtc", true)]
    [InlineData("chequeDateToUtc", true)]
    [InlineData("asOfUtc", true)]
    [InlineData("periodEndUtc", true)]
    [InlineData("periodStartUtc", false)]
    [InlineData("fromUtc", false)]
    [InlineData("DateFromUtc", false)]
    [InlineData("monthStartUtc", false)]
    public void IsUpperBound_Should_Recognise_TheEndOfARange(string name, bool expected) =>
        PurchasingQueryDates.IsUpperBound(name).ShouldBe(expected);

    [Fact]
    public async Task Filter_Should_Normalize_DateParameters_And_AsParametersProperties_On_Get()
    {
        Delegate endpoint = (DateTime fromUtc, DateTime? toUtc, [AsParameters] SearchQuery query) => Results.Ok();
        var filter = PurchasingQueryDates.Factory(
            new EndpointFilterFactoryContext { MethodInfo = endpoint.Method },
            context => ValueTask.FromResult<object?>(context.Arguments.ToList()));
        var http = new DefaultHttpContext();
        http.Request.Method = HttpMethods.Get;
        var query = new SearchQuery { DateFromUtc = DateOnlyValue, DateToUtc = DateOnlyValue, PageNumber = 1 };

        var result = (List<object?>)(await filter(new DefaultEndpointFilterInvocationContext(http, DateOnlyValue, (DateTime?)DateOnlyValue, query)))!;

        ((DateTime)result[0]!).ShouldBe(new DateTime(2026, 9, 30, 18, 15, 0, DateTimeKind.Utc));
        ((DateTime)result[1]!).Kind.ShouldBe(DateTimeKind.Utc);
        ((DateTime)result[1]!).ShouldBe(new DateTime(2026, 10, 1, 18, 15, 0, DateTimeKind.Utc).AddTicks(-TimeSpan.TicksPerMicrosecond));
        query.DateFromUtc.ShouldBe(new DateTime(2026, 9, 30, 18, 15, 0, DateTimeKind.Utc));
        query.DateToUtc!.Value.ShouldBeGreaterThan(query.DateFromUtc!.Value.AddHours(23));
    }
}
