namespace FSH.Modules.Customers.Domain;

/// <summary>Where an open sale on account stands against its due date on a given day. Mirrors the Suppliers
/// module's terms for bills (modules share nothing but Contracts, so the few lines are repeated).</summary>
public enum DueBucket
{
    /// <summary>Due today or later.</summary>
    NotYetDue = 0,
    Overdue1To30 = 1,
    Overdue31To60 = 2,
    Overdue61To90 = 3,
    OverdueOver90 = 4,

    /// <summary>No due date: the customer has no credit terms.</summary>
    NoDueDate = 5,
}

/// <summary>
/// Customer payment terms: when a sale on account (or other debit) falls due, and how far past it it is. Pure.
/// <para>A credit sale stores its due date (<see cref="CustomerLedgerEntry.DueDateUtc"/>) - the sale date plus the
/// customer's credit days at the time - so later changes to the customer's terms don't move it. A debit stored
/// without one (recorded before due dates existed, or while the customer had no terms) is read with the customer's
/// <i>current</i> credit days (<see cref="EffectiveDueDate"/>); with no terms at all it stays undated and is aged by
/// date only.</para>
/// <para>Days are whole 24-hour periods, the same rule the date aging uses: a debit is overdue from one full day
/// after its due date.</para>
/// </summary>
public static class PaymentTerms
{
    /// <summary>Longest credit period accepted (a year).</summary>
    public const int MaxCreditDays = 365;

    public static void EnsureValidCreditDays(int? creditDays)
    {
        if (creditDays is < 0 or > MaxCreditDays)
        {
            throw new ArgumentOutOfRangeException(nameof(creditDays), creditDays, $"Credit days must be between 0 and {MaxCreditDays}.");
        }
    }

    /// <summary>The bill's own due date when given, otherwise the bill date plus <paramref name="creditDays"/>;
    /// null when there are no terms.</summary>
    public static DateTime? DueDate(DateTime billDateUtc, int? creditDays, DateTime? overrideDueDateUtc = null)
    {
        if (overrideDueDateUtc is { } dueDate)
        {
            // Stored as timestamptz: a local or unspecified value from a request body is normalized to UTC.
            return dueDate.Kind switch
            {
                DateTimeKind.Local => dueDate.ToUniversalTime(),
                DateTimeKind.Unspecified => DateTime.SpecifyKind(dueDate, DateTimeKind.Utc),
                _ => dueDate,
            };
        }

        return creditDays is { } days ? billDateUtc.AddDays(days) : null;
    }

    /// <summary>The due date a stored bill is read with: its own, or (for a bill stored without one) the bill date
    /// plus the supplier's current credit days.</summary>
    public static DateTime? EffectiveDueDate(DateTime? storedDueDateUtc, DateTime billDateUtc, int? currentCreditDays) =>
        storedDueDateUtc ?? DueDate(billDateUtc, currentCreditDays);

    /// <summary>Whole days <paramref name="asOfUtc"/> is past <paramref name="dueDateUtc"/>: positive = overdue,
    /// 0 = due today, negative = days still to go.</summary>
    public static int DaysOverdue(DateTime dueDateUtc, DateTime asOfUtc) => (asOfUtc - dueDateUtc).Days;

    /// <summary>
    /// Status of an open debit for collection scheduling: <c>overdue</c> (past its due date), <c>due_soon</c> (due
    /// today or within <paramref name="withinDays"/> days), <c>later</c>, or <c>no_due_date</c>.
    /// </summary>
    public static string ScheduleStatus(DateTime? dueDateUtc, DateTime asOfUtc, int withinDays)
    {
        if (dueDateUtc is not { } dueDate)
        {
            return NoDueDateStatus;
        }

        int daysOverdue = DaysOverdue(dueDate, asOfUtc);
        if (daysOverdue > 0)
        {
            return OverdueStatus;
        }

        return -daysOverdue <= withinDays ? DueSoonStatus : LaterStatus;
    }

    public const string OverdueStatus = "overdue";
    public const string DueSoonStatus = "due_soon";
    public const string LaterStatus = "later";
    public const string NoDueDateStatus = "no_due_date";

    public static DueBucket BucketOf(DateTime? dueDateUtc, DateTime asOfUtc)
    {
        if (dueDateUtc is not { } dueDate)
        {
            return DueBucket.NoDueDate;
        }

        return DaysOverdue(dueDate, asOfUtc) switch
        {
            <= 0 => DueBucket.NotYetDue,
            <= 30 => DueBucket.Overdue1To30,
            <= 60 => DueBucket.Overdue31To60,
            <= 90 => DueBucket.Overdue61To90,
            _ => DueBucket.OverdueOver90,
        };
    }
}

/// <summary>Outstanding amounts summed by <see cref="DueBucket"/>.</summary>
public sealed class DueBucketTotals
{
    public decimal NotYetDue { get; private set; }
    public decimal Overdue1To30 { get; private set; }
    public decimal Overdue31To60 { get; private set; }
    public decimal Overdue61To90 { get; private set; }
    public decimal OverdueOver90 { get; private set; }
    public decimal NoDueDate { get; private set; }

    public decimal Overdue => Overdue1To30 + Overdue31To60 + Overdue61To90 + OverdueOver90;

    public void Add(DueBucket bucket, decimal amount)
    {
        switch (bucket)
        {
            case DueBucket.NotYetDue: NotYetDue += amount; break;
            case DueBucket.Overdue1To30: Overdue1To30 += amount; break;
            case DueBucket.Overdue31To60: Overdue31To60 += amount; break;
            case DueBucket.Overdue61To90: Overdue61To90 += amount; break;
            case DueBucket.OverdueOver90: OverdueOver90 += amount; break;
            default: NoDueDate += amount; break;
        }
    }
}
