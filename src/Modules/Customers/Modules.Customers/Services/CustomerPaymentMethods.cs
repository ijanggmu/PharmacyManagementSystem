namespace FSH.Modules.Customers.Services;

/// <summary>
/// Methods a customer receipt can be taken by. Accounting books cash to Cash and every other method to its mapped
/// money account (Bank by default), so an unknown word ("bitcoin") must be refused rather than silently posted to Bank.
/// Blank means cash.
/// </summary>
internal static class CustomerPaymentMethods
{
    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "cash", "card", "bank", "bank_transfer", "fonepay", "esewa", "khalti", "cheque", "other",
    };

    public const string Message = "Choose how the customer paid: cash, card, bank, bank_transfer, fonepay, esewa, khalti, cheque or other.";

    public static bool IsKnownOrBlank(string? method) => string.IsNullOrWhiteSpace(method) || All.Contains(method.Trim());
}
