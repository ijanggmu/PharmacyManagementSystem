using System.Globalization;
using FSH.Modules.Sales.Contracts.Fiscal;

namespace FSH.Modules.Payroll.Domain;

/// <summary>
/// A Bikram Sambat month as a payroll period: its AD date range, the fiscal year it belongs to (Shrawan–Ashadh) and
/// its position in that year. Uses the shared BS tables (<see cref="BikramSambat"/>, <see cref="NepalFiscalYear"/>), so
/// the period agrees with the rest of the app.
/// </summary>
public sealed record NepaliMonth(int BsYear, int BsMonth, DateOnly Start, DateOnly End)
{
    private static readonly string[] Names =
        ["Baisakh", "Jestha", "Ashadh", "Shrawan", "Bhadra", "Ashwin", "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra"];

    /// <summary>The BS year the fiscal year starts in (Shrawan): 2083 for every month of 2083/84.</summary>
    public int FiscalYearStart => FiscalYearStartFor(BsYear, BsMonth);

    /// <summary>1 for Shrawan … 12 for Ashadh.</summary>
    public int MonthOfFiscalYear => MonthOfFiscalYearFor(BsMonth);

    /// <summary>This month through Ashadh, inclusive.</summary>
    public int RemainingMonthsInFiscalYear => 13 - MonthOfFiscalYear;

    public int Days => End.DayNumber - Start.DayNumber + 1;

    /// <summary>"Shrawan 2083".</summary>
    public string Label => $"{Names[BsMonth - 1]} {BsYear.ToString(CultureInfo.InvariantCulture)}";

    /// <summary>"2083/84".</summary>
    public string FiscalYearLabel => NepalFiscalYear.Label(FiscalYearStart);

    public static int FiscalYearStartFor(int bsYear, int bsMonth) => bsMonth >= 4 ? bsYear : bsYear - 1;

    public static int MonthOfFiscalYearFor(int bsMonth) => bsMonth >= 4 ? bsMonth - 3 : bsMonth + 9;

    public static string MonthName(int bsMonth) => Names[bsMonth - 1];

    /// <summary>Whether the shared BS tables cover this month.</summary>
    public static bool IsSupported(int bsYear, int bsMonth)
    {
        if (bsMonth is < 1 or > 12)
        {
            return false;
        }

        int fy = FiscalYearStartFor(bsYear, bsMonth);
        return fy >= NepalFiscalYear.FirstStartYear && fy <= NepalFiscalYear.LastStartYear;
    }

    /// <summary>The AD range of BS <paramref name="bsYear"/>-<paramref name="bsMonth"/>. Throws when the tables don't
    /// cover it.</summary>
    public static NepaliMonth Of(int bsYear, int bsMonth)
    {
        if (!IsSupported(bsYear, bsMonth))
        {
            throw new ArgumentOutOfRangeException(nameof(bsYear), $"BS {bsYear}-{bsMonth} is outside the supported calendar range.");
        }

        var (fyStart, fyEnd) = NepalFiscalYear.Range(FiscalYearStartFor(bsYear, bsMonth));
        DateOnly? start = null;
        DateOnly? end = null;
        for (var day = fyStart; day <= fyEnd; day = day.AddDays(1))
        {
            var bs = BikramSambat.FromAd(day);
            if (bs.Year == bsYear && bs.Month == bsMonth)
            {
                start ??= day;
                end = day;
            }
            else if (start is not null)
            {
                break;
            }
        }

        return start is { } s && end is { } e
            ? new NepaliMonth(bsYear, bsMonth, s, e)
            : throw new ArgumentOutOfRangeException(nameof(bsYear), $"BS {bsYear}-{bsMonth} is outside the supported calendar range.");
    }
}
