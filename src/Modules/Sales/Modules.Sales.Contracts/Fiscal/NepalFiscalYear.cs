using System.Globalization;

namespace FSH.Modules.Sales.Contracts.Fiscal;

/// <summary>
/// Nepal's fiscal year runs from 1 Shrawan to the last day of Ashadh (Bikram Sambat). BS month
/// lengths aren't computable, so the AD date of each 1 Shrawan is a lookup table — generated from the
/// same <c>nepali-date-converter</c> data the web app uses (features/accounting/lib/date-presets.ts),
/// so the server and the UI always agree on which fiscal year a sale falls in.
/// Dates are compared in Nepal time (UTC+05:45): a sale at 00:30 NPT on 1 Shrawan is still the
/// previous day in UTC, so the offset is applied before the lookup.
/// </summary>
public static class NepalFiscalYear
{
    private static readonly TimeSpan NepalOffset = new(5, 45, 0);

    /// <summary>BS start year → AD date of 1 Shrawan of that year.</summary>
    private static readonly (int BsYear, DateOnly Start)[] Starts =
    [
        (2070, new DateOnly(2013, 7, 16)),
        (2071, new DateOnly(2014, 7, 17)),
        (2072, new DateOnly(2015, 7, 17)),
        (2073, new DateOnly(2016, 7, 16)),
        (2074, new DateOnly(2017, 7, 16)),
        (2075, new DateOnly(2018, 7, 17)),
        (2076, new DateOnly(2019, 7, 17)),
        (2077, new DateOnly(2020, 7, 16)),
        (2078, new DateOnly(2021, 7, 16)),
        (2079, new DateOnly(2022, 7, 17)),
        (2080, new DateOnly(2023, 7, 17)),
        (2081, new DateOnly(2024, 7, 16)),
        (2082, new DateOnly(2025, 7, 17)),
        (2083, new DateOnly(2026, 7, 17)),
        (2084, new DateOnly(2027, 7, 17)),
        (2085, new DateOnly(2028, 7, 16)),
        (2086, new DateOnly(2029, 7, 17)),
        (2087, new DateOnly(2030, 7, 17)),
        (2088, new DateOnly(2031, 7, 17)),
        (2089, new DateOnly(2032, 7, 16)),
        (2090, new DateOnly(2033, 7, 16)),
    ];

    /// <summary>Upper bound of the table: 1 Shrawan 2091 is outside the source data, so FY 2090/91 is
    /// cut off one AD year after it started and later dates throw rather than guess.</summary>
    private static readonly DateOnly TableEnd = new(2034, 7, 16);

    /// <summary>The BS year in which the fiscal year containing <paramref name="utc"/> started (e.g. 2083 for 2083/84).</summary>
    public static int StartYearFor(DateTime utc)
    {
        var nepalDate = DateOnly.FromDateTime(DateTime.SpecifyKind(utc, DateTimeKind.Utc) + NepalOffset);

        if (nepalDate < Starts[0].Start || nepalDate >= TableEnd)
        {
            throw new InvalidOperationException(
                $"No Nepali fiscal-year data for {nepalDate:yyyy-MM-dd}. Extend NepalFiscalYear.Starts.");
        }

        int year = Starts[0].BsYear;
        foreach (var (bsYear, start) in Starts)
        {
            if (nepalDate < start)
            {
                break;
            }

            year = bsYear;
        }

        return year;
    }

    /// <summary>"2083/84" — the same label the web app shows (fiscalYearLabel).</summary>
    public static string Label(int startBsYear) =>
        string.Create(CultureInfo.InvariantCulture, $"{startBsYear}/{(startBsYear + 1) % 100:D2}");
}
