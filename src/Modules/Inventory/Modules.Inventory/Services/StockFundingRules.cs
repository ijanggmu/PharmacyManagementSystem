using FluentValidation;
using FSH.Modules.Inventory.Contracts.Events;

namespace FSH.Modules.Inventory.Services;

/// <summary>
/// Validation shared by every command that can add stock without a supplier bill (create medicine, add stock,
/// edit medicine with a new lot, manual batch): the funding must be a known <see cref="StockFundingSources"/>
/// value, and cash/bank funding can't be combined with a supplier — supplier stock is paid through its bill.
/// </summary>
internal static class StockFundingRules
{
    public const string UnknownMessage =
        "Choose how the stock was paid for: opening stock (already owned), cash, or bank / wallet.";

    public const string SupplierConflictMessage =
        "Stock from a supplier is paid through the supplier bill. Record the bill payment instead, or remove the supplier to mark this stock as bought for cash / bank.";

    public static IRuleBuilderOptions<T, string?> MustBeKnownStockFunding<T>(this IRuleBuilder<T, string?> rule) =>
        rule.Must(f => f is null || StockFundingSources.IsKnown(f)).WithMessage(UnknownMessage);

    public static IRuleBuilderOptions<T, string?> MustNotBePaidWithSupplier<T>(
        this IRuleBuilder<T, string?> rule, Func<T, Guid?> supplierId) =>
        rule.Must((command, funding) => supplierId(command) is null || !StockFundingSources.IsPaid(funding))
            .WithMessage(SupplierConflictMessage);
}
