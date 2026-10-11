namespace FSH.Modules.Reference.Contracts.Licenses;

/// <summary>
/// The registrations a Nepali pharmacy has to keep current. <see cref="Other"/> covers anything else
/// (fire safety, signboard tax, …) with a free-text title.
/// </summary>
public static class PharmacyLicenseTypes
{
    public const string DdaPharmacy = "dda_pharmacy";
    public const string PharmacistRegistration = "pharmacist_registration";
    public const string PanVat = "pan_vat";
    public const string Municipality = "municipality";
    public const string Company = "company";
    public const string Other = "other";

    public static IReadOnlyDictionary<string, string> Labels { get; } = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        [DdaPharmacy] = "DDA pharmacy license",
        [PharmacistRegistration] = "Pharmacist registration (NPC)",
        [PanVat] = "PAN / VAT registration",
        [Municipality] = "Municipality / ward registration",
        [Company] = "Company registration (OCR)",
        [Other] = "Other",
    };

    public static bool IsKnown(string? type) => type is not null && Labels.ContainsKey(type);

    /// <summary>What to call the license: its title for "other", else the type's label.</summary>
    public static string Describe(string type, string? title) =>
        type == Other && !string.IsNullOrWhiteSpace(title) ? title.Trim() : Labels.GetValueOrDefault(type, type);
}

/// <summary>Where a license stands today.</summary>
public static class PharmacyLicenseStatus
{
    /// <summary>Licenses are flagged this many days before they expire.</summary>
    public const int ExpiringWithinDays = 60;

    public const string Valid = "valid";
    public const string Expiring = "expiring";
    public const string Expired = "expired";

    public static string For(int daysLeft)
    {
        if (daysLeft < 0)
        {
            return Expired;
        }

        return daysLeft <= ExpiringWithinDays ? Expiring : Valid;
    }
}
