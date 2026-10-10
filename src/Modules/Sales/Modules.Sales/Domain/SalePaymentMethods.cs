namespace FSH.Modules.Sales.Domain;

/// <summary>
/// Tender methods accepted by the legacy checkout (sale_payments.payment_method). Input is matched
/// case-insensitively and mapped to the canonical lowercase value stored on the row.
/// </summary>
public static class SalePaymentMethods
{
    public const string Cash = "cash";
    public const string Credit = "credit";
    public const string Mixed = "mixed";

    public static readonly IReadOnlyList<string> All =
        ["cash", "card", "insurance", "fonepay", "esewa", "khalti", "bank", Credit, "other"];

    /// <summary>Returns the canonical method name, or null when the method is not accepted.</summary>
    public static string? Normalize(string? method)
    {
        if (string.IsNullOrWhiteSpace(method))
        {
            return null;
        }

        string trimmed = method.Trim();
        foreach (var candidate in All)
        {
            if (string.Equals(candidate, trimmed, StringComparison.OrdinalIgnoreCase))
            {
                return candidate;
            }
        }

        return null;
    }
}
