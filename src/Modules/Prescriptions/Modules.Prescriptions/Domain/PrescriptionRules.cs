namespace FSH.Modules.Prescriptions.Domain;

/// <summary>
/// Issue limits for a prescription (Nepal DDA practice). A prescription-only medicine may be written for at
/// most a year with a bounded number of refills; a controlled (scheduled/narcotic) medicine is a single-fill
/// prescription valid for at most six months.
/// </summary>
public static class PrescriptionRules
{
    /// <summary>Most refills (fills beyond the first) any item may allow.</summary>
    public const int MaxRefills = 12;

    /// <summary>Controlled medicines are dispensed once per prescription: no refills.</summary>
    public const int MaxControlledRefills = 0;

    /// <summary>Longest validity (issue date to expiry) of a prescription.</summary>
    public const int MaxValidityMonths = 12;

    /// <summary>Longest validity of a prescription that has a controlled medicine on it.</summary>
    public const int MaxControlledValidityMonths = 6;

    /// <summary>The latest expiry date allowed for a prescription issued on <paramref name="prescriptionDate"/>.</summary>
    public static DateOnly LatestExpiryFor(DateOnly prescriptionDate, bool hasControlledItem) =>
        prescriptionDate.AddMonths(hasControlledItem ? MaxControlledValidityMonths : MaxValidityMonths);
}
