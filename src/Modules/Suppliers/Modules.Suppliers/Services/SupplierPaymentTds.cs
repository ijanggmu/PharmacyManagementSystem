using FSH.Modules.Suppliers.Contracts.v1.Ledger;

namespace FSH.Modules.Suppliers.Services;

/// <summary>
/// TDS withheld from a supplier payment. Suppliers only carries it: the category list and the TDS Payable posting
/// belong to Accounting, which receives it on <c>SupplierPaymentRecordedIntegrationEvent</c>.
/// <see cref="TaxableAmount"/> defaults to the payment amount (enter the amount excluding VAT when the bill carried VAT).
/// </summary>
internal sealed record SupplierPaymentTds(decimal Amount, string Category, decimal? RatePercent, decimal TaxableAmount)
{
    /// <summary>The command's TDS, or null when none is withheld.</summary>
    public static SupplierPaymentTds? From(RecordSupplierPaymentCommand command)
    {
        ArgumentNullException.ThrowIfNull(command);
        if (command.TdsAmount is not > 0m || string.IsNullOrWhiteSpace(command.TdsCategory))
        {
            return null;
        }

        return new SupplierPaymentTds(
            Math.Round(command.TdsAmount.Value, 2, MidpointRounding.AwayFromZero),
            // Accounting normalizes the code (TDS category codes are lower-case identifiers).
            command.TdsCategory.Trim(),
            command.TdsRatePercent,
            command.TdsTaxableAmount ?? command.Amount);
    }
}
