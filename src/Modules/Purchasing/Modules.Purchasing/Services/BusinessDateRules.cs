using FSH.Modules.Sales.Contracts.Fiscal;

namespace FSH.Modules.Purchasing.Services;

/// <summary>
/// The date a document is booked on (payment, debit note, goods receipt): set, not in the future — compared as a
/// Nepal calendar date, with one day of tolerance for clock skew and the UTC/NPT day boundary — and inside the
/// range <see cref="NepalFiscalYear"/> can number, so numbering never throws a 500 for a bad date.
/// </summary>
internal static class BusinessDateRules
{
    private static readonly TimeSpan NepalOffset = new(5, 45, 0);

    public const string Message =
        "Enter a valid date: not in the future and within a supported Nepali fiscal year.";

    public static bool IsValid(DateTime value) => IsValid(value, DateTime.UtcNow);

    internal static bool IsValid(DateTime value, DateTime utcNow)
    {
        if (value == default)
        {
            return false;
        }

        DateOnly date = DateOnly.FromDateTime(DateTime.SpecifyKind(value, DateTimeKind.Utc) + NepalOffset);
        DateOnly today = DateOnly.FromDateTime(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc) + NepalOffset);
        if (date > today.AddDays(1))
        {
            return false;
        }

        try
        {
            _ = NepalFiscalYear.StartYearFor(value);
            return true;
        }
        catch (InvalidOperationException)
        {
            return false;
        }
    }
}
