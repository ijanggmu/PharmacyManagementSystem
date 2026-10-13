using System.Globalization;
using FSH.Modules.Sales.Contracts.Fiscal;

namespace FSH.Modules.Accounting.Domain;

/// <summary>
/// A month of a Nepali fiscal year: <see cref="FiscalYear"/> is the BS year the year starts in (2083 for 2083/84) and
/// <see cref="Month"/> runs 1 = Shrawan … 9 = Chaitra, 10 = Baisakh … 12 = Ashadh (the months of the next BS year).
/// <see cref="Index"/> numbers months consecutively across years, so "the months from A to B" is plain integer
/// arithmetic — the depreciation schedules work on it.
/// </summary>
public readonly record struct FiscalPeriod(int FiscalYear, int Month)
{
    /// <summary>BS month names, 1-based (1 = Baishakh), spelled as the web app spells them.</summary>
    private static readonly string[] BsMonthNames =
        ["Baishakh", "Jestha", "Ashadh", "Shrawan", "Bhadra", "Ashwin", "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra"];

    /// <summary>Months counted from year 0: <c>FiscalYear × 12 + Month − 1</c>.</summary>
    public int Index => (FiscalYear * 12) + Month - 1;

    /// <summary>The BS calendar year the month falls in (Baisakh–Ashadh are in the year after the fiscal start year).</summary>
    public int BsYear => Month <= 9 ? FiscalYear : FiscalYear + 1;

    /// <summary>The BS calendar month (1 = Baishakh … 12 = Chaitra).</summary>
    public int BsMonth => Month <= 9 ? Month + 3 : Month - 9;

    /// <summary>"Shrawan 2083".</summary>
    public string Label => string.Create(CultureInfo.InvariantCulture, $"{BsMonthNames[BsMonth - 1]} {BsYear}");

    public static FiscalPeriod FromIndex(int index) => new(index / 12, (index % 12) + 1);

    /// <summary>The fiscal month containing the Nepal calendar day <paramref name="nepalDay"/>.</summary>
    public static FiscalPeriod Of(DateOnly nepalDay)
    {
        BsDate bs = BikramSambat.FromAd(nepalDay);
        return bs.Month >= 4 ? new FiscalPeriod(bs.Year, bs.Month - 3) : new FiscalPeriod(bs.Year - 1, bs.Month + 9);
    }

    /// <summary>The fiscal month containing the UTC instant <paramref name="utc"/>, in Nepal time.</summary>
    public static FiscalPeriod OfUtc(DateTime utc) => Of(DateOnly.FromDateTime(DateTime.SpecifyKind(utc, DateTimeKind.Utc) + new TimeSpan(5, 45, 0)));

    /// <summary>The first and last Nepal calendar day (AD) of this month.</summary>
    public (DateOnly First, DateOnly Last) Days()
    {
        var (yearStart, yearEnd) = NepalFiscalYear.Range(FiscalYear);
        DateOnly? first = null;
        DateOnly last = yearStart;
        for (DateOnly day = yearStart; day <= yearEnd; day = day.AddDays(1))
        {
            int month = Of(day).Month;
            if (month == Month)
            {
                first ??= day;
                last = day;
            }
            else if (month > Month)
            {
                break;
            }
        }

        return first is { } f
            ? (f, last)
            : throw new InvalidOperationException($"No days found for fiscal month {Month} of {FiscalYear}.");
    }

    /// <summary>The share of an addition's cost that enters a Schedule 2 pool's depreciation base in the year it is
    /// acquired, in thirds: 3 (in full) for Shrawan–Poush, 2 for Magh–Chaitra, 1 for Baisakh–Ashadh.</summary>
    public int TaxAdditionThirds => Month switch
    {
        <= 6 => 3,
        <= 9 => 2,
        _ => 1,
    };
}
