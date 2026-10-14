using FSH.Modules.Accounting.Services;
using Microsoft.AspNetCore.Http;

namespace Accounting.Tests.Features.Reports;

/// <summary>
/// <see cref="AccountingQueryDates"/>: date-only and zoneless query dates reach the handlers as UTC — a date as the
/// Nepal business day's bounds — instead of an Unspecified <see cref="DateTime"/> that Npgsql refuses (500).
/// </summary>
public sealed class AccountingQueryDatesTests
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
        var from = AccountingQueryDates.Normalize(DateOnlyValue, upperBound: false);
        var to = AccountingQueryDates.Normalize(DateOnlyValue, upperBound: true);

        from.ShouldBe(new DateTime(2026, 9, 30, 18, 15, 0, DateTimeKind.Utc));
        from.Kind.ShouldBe(DateTimeKind.Utc);
        to.ShouldBe(new DateTime(2026, 10, 1, 18, 15, 0, DateTimeKind.Utc).AddTicks(-TimeSpan.TicksPerMicrosecond));
        NepalDate.FromUtc(to).ShouldBe(new DateOnly(2026, 10, 1));
    }

    [Fact]
    public void Normalize_Should_TreatAZonelessTime_AsUtc_And_KeepUtc()
    {
        var zoneless = new DateTime(2026, 10, 1, 9, 30, 0, DateTimeKind.Unspecified);
        var utc = new DateTime(2026, 10, 1, 9, 30, 0, DateTimeKind.Utc);

        var normalized = AccountingQueryDates.Normalize(zoneless, upperBound: true);
        normalized.ShouldBe(utc);
        normalized.Kind.ShouldBe(DateTimeKind.Utc);
        AccountingQueryDates.Normalize(utc, upperBound: false).ShouldBe(utc);
        AccountingQueryDates.Normalize(utc.ToLocalTime(), upperBound: false).ShouldBe(utc);
    }

    [Theory]
    [InlineData("toUtc", true)]
    [InlineData("DateToUtc", true)]
    [InlineData("chequeDateToUtc", true)]
    [InlineData("asOfUtc", true)]
    [InlineData("fromUtc", false)]
    [InlineData("DateFromUtc", false)]
    [InlineData("monthStartUtc", false)]
    public void IsUpperBound_Should_Recognise_TheEndOfARange(string name, bool expected) =>
        AccountingQueryDates.IsUpperBound(name).ShouldBe(expected);

    [Fact]
    public async Task Filter_Should_Normalize_DateParameters_And_AsParametersProperties_On_Get()
    {
        Delegate endpoint = (DateTime fromUtc, DateTime? toUtc, [AsParameters] SearchQuery query) => Results.Ok();
        var filter = AccountingQueryDates.Factory(
            new EndpointFilterFactoryContext { MethodInfo = endpoint.Method },
            context => ValueTask.FromResult<object?>(context.Arguments.ToList()));
        var http = new DefaultHttpContext();
        http.Request.Method = HttpMethods.Get;
        var query = new SearchQuery { DateFromUtc = DateOnlyValue, DateToUtc = DateOnlyValue, PageNumber = 1 };

        var result = (List<object?>)(await filter(new DefaultEndpointFilterInvocationContext(http, DateOnlyValue, (DateTime?)DateOnlyValue, query)))!;

        ((DateTime)result[0]!).ShouldBe(new DateTime(2026, 9, 30, 18, 15, 0, DateTimeKind.Utc));
        ((DateTime)result[1]!).Kind.ShouldBe(DateTimeKind.Utc);
        NepalDate.FromUtc((DateTime)result[1]!).ShouldBe(new DateOnly(2026, 10, 1));
        query.DateFromUtc.ShouldBe(new DateTime(2026, 9, 30, 18, 15, 0, DateTimeKind.Utc));
        query.DateToUtc!.Value.ShouldBeGreaterThan(query.DateFromUtc!.Value.AddHours(23));
    }
}
