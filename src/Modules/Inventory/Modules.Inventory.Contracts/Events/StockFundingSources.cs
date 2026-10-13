namespace FSH.Modules.Inventory.Contracts.Events;

/// <summary>
/// How stock added without a supplier bill was funded — carried on the stock commands and on
/// <see cref="OpeningStockReceivedIntegrationEvent"/> so Accounting credits the right account:
/// <list type="bullet">
/// <item><see cref="OpeningStock"/> (the default, also when omitted) — stock the pharmacy already owned
/// at go-live: Dr Inventory / Cr Owner's Equity.</item>
/// <item><see cref="Cash"/> — bought and paid in cash: Dr Inventory / Cr Cash.</item>
/// <item><see cref="Bank"/> — paid by bank transfer, card or wallet (eSewa, Khalti, Fonepay): Dr Inventory / Cr Bank.</item>
/// </list>
/// Stock from a supplier is never funded this way — its bill (and any payment at entry) goes through the
/// supplier-bill path instead.
/// </summary>
public static class StockFundingSources
{
    public const string OpeningStock = "opening_stock";
    public const string Cash = "cash";
    public const string Bank = "bank";

    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        OpeningStock, Cash, Bank,
    };

    /// <summary>True for a recognised value; null/blank is not "known" (callers treat it as the default).</summary>
    public static bool IsKnown(string? funding) => funding is not null && All.Contains(funding.Trim());

    /// <summary>The canonical value; null, blank or unrecognised means <see cref="OpeningStock"/>.</summary>
    public static string Normalize(string? funding)
    {
        if (string.IsNullOrWhiteSpace(funding))
        {
            return OpeningStock;
        }

        string trimmed = funding.Trim();
        if (string.Equals(trimmed, Cash, StringComparison.OrdinalIgnoreCase))
        {
            return Cash;
        }

        return string.Equals(trimmed, Bank, StringComparison.OrdinalIgnoreCase) ? Bank : OpeningStock;
    }

    /// <summary>True when the stock was paid for (cash or bank) rather than already owned.</summary>
    public static bool IsPaid(string? funding) => Normalize(funding) is Cash or Bank;
}
