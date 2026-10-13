using System.Globalization;

namespace FSH.Modules.Sales.Contracts.Fiscal;

/// <summary>A Bikram Sambat calendar date. <see cref="Month"/> is 1-based (1 = Baisakh, 4 = Shrawan).</summary>
public readonly record struct BsDate(int Year, int Month, int Day)
{
    /// <summary>"2083.06.27" — the <c>yyyy.mm.dd</c> form IRD's CBMS API and materialized view use.</summary>
    public string ToIrdString() =>
        string.Create(CultureInfo.InvariantCulture, $"{Year:D4}.{Month:D2}.{Day:D2}");

    public override string ToString() => ToIrdString();
}

/// <summary>
/// AD → Bikram Sambat conversion. BS month lengths are not computable, so they are a lookup table, generated from
/// the same <c>nepali-date-converter</c> data the web app uses (and that <see cref="NepalFiscalYear"/>'s 1 Shrawan
/// table comes from), covering BS 2069–2090. Instants are converted in Nepal time (UTC+05:45), so a bill issued at
/// 00:30 NPT carries that Nepal day's BS date even though it is still the previous day in UTC.
/// </summary>
public static class BikramSambat
{
    private static readonly TimeSpan NepalOffset = new(5, 45, 0);

    /// <summary>BS year → AD date of 1 Baisakh, and the day count of each of its 12 months.</summary>
    private static readonly (int Year, DateOnly Start, int[] Months)[] Years =
    [
        (2069, new DateOnly(2012, 4, 13), [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31]),
        (2070, new DateOnly(2013, 4, 14), [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30]),
        (2071, new DateOnly(2014, 4, 14), [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30]),
        (2072, new DateOnly(2015, 4, 14), [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30]),
        (2073, new DateOnly(2016, 4, 13), [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31]),
        (2074, new DateOnly(2017, 4, 14), [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30]),
        (2075, new DateOnly(2018, 4, 14), [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30]),
        (2076, new DateOnly(2019, 4, 14), [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30]),
        (2077, new DateOnly(2020, 4, 13), [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31]),
        (2078, new DateOnly(2021, 4, 14), [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30]),
        (2079, new DateOnly(2022, 4, 14), [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30]),
        (2080, new DateOnly(2023, 4, 14), [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30]),
        (2081, new DateOnly(2024, 4, 13), [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31]),
        (2082, new DateOnly(2025, 4, 14), [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30]),
        (2083, new DateOnly(2026, 4, 14), [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30]),
        (2084, new DateOnly(2027, 4, 14), [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31]),
        (2085, new DateOnly(2028, 4, 14), [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31]),
        (2086, new DateOnly(2029, 4, 14), [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30]),
        (2087, new DateOnly(2030, 4, 14), [31, 31, 32, 31, 31, 31, 30, 30, 29, 30, 30, 30]),
        (2088, new DateOnly(2031, 4, 15), [30, 31, 32, 32, 30, 31, 30, 30, 29, 30, 30, 30]),
        (2089, new DateOnly(2032, 4, 14), [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30]),
        (2090, new DateOnly(2033, 4, 14), [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30]),
    ];

    /// <summary>The BS date of the Nepal calendar day <paramref name="adDate"/>.</summary>
    public static BsDate FromAd(DateOnly adDate)
    {
        for (int i = Years.Length - 1; i >= 0; i--)
        {
            var (year, start, months) = Years[i];
            if (adDate < start)
            {
                continue;
            }

            int offset = adDate.DayNumber - start.DayNumber;
            for (int m = 0; m < 12; m++)
            {
                if (offset < months[m])
                {
                    return new BsDate(year, m + 1, offset + 1);
                }

                offset -= months[m];
            }

            break; // past the last day of the table's last year
        }

        throw new ArgumentOutOfRangeException(
            nameof(adDate), adDate, $"No Bikram Sambat data for {adDate:yyyy-MM-dd}. Extend BikramSambat.Years.");
    }

    /// <summary>The BS date, in Nepal time, of the UTC instant <paramref name="utc"/>.</summary>
    public static BsDate FromUtc(DateTime utc) =>
        FromAd(DateOnly.FromDateTime(DateTime.SpecifyKind(utc, DateTimeKind.Utc) + NepalOffset));

    /// <summary>"2083.06.27" for the UTC instant <paramref name="utc"/> (Nepal day).</summary>
    public static string FormatUtc(DateTime utc) => FromUtc(utc).ToIrdString();

    /// <summary>"2083.084" — fiscal year 2083/84 the way CBMS's <c>fiscal_year</c> field expects it.</summary>
    public static string CbmsFiscalYear(int startBsYear) =>
        string.Create(CultureInfo.InvariantCulture, $"{startBsYear}.{(startBsYear + 1) % 1000:D3}");
}
