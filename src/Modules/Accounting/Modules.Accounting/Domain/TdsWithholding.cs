namespace FSH.Modules.Accounting.Domain;

/// <summary>
/// TDS withheld on one document: the category it was withheld under (code + name snapshot), the rate used, the
/// taxable amount (excluding VAT) and the TDS amount itself — which may differ from taxable × rate when the user
/// adjusted it. Amounts are in rupees to the paisa.
/// </summary>
public sealed record TdsWithholding(string CategoryCode, string CategoryName, decimal RatePercent, decimal TaxableAmount, decimal Amount)
{
    /// <summary>taxable × rate%, rounded half away from zero to the paisa.</summary>
    public static decimal Compute(decimal taxableAmount, decimal ratePercent) =>
        Math.Round(taxableAmount * ratePercent / 100m, 2, MidpointRounding.AwayFromZero);
}
