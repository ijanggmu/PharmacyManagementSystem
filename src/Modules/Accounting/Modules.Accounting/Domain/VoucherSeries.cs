using System.Globalization;

namespace FSH.Modules.Accounting.Domain;

/// <summary>
/// Type-wise voucher numbering (Tally-style): each series has its own counter per tenant, so sales,
/// purchases, receipts and payments each run their own sequence (SAL-000001, PUR-000001, ...) instead of
/// sharing one count. The series code is also the voucher-number prefix.
/// </summary>
public static class VoucherSeries
{
    /// <summary>Sales invoices.</summary>
    public const string Sales = "SAL";

    /// <summary>Credit notes to customers: sales returns and refunds.</summary>
    public const string SalesReturn = "SRN";

    /// <summary>Purchases (goods received from suppliers).</summary>
    public const string Purchase = "PUR";

    /// <summary>Debit notes to suppliers: purchase returns.</summary>
    public const string PurchaseReturn = "PRN";

    /// <summary>Money received: customer payments.</summary>
    public const string Receipt = "RCT";

    /// <summary>Money paid out: supplier payments, expenses, VAT payments.</summary>
    public const string Payment = "PMT";

    /// <summary>Cash/bank transfers (bank deposits).</summary>
    public const string Contra = "CNT";

    /// <summary>Opening balances and opening stock.</summary>
    public const string Opening = "OB";

    /// <summary>Journals: manual vouchers, inventory adjustments, stock transfers, consignment settlements,
    /// and any voucher type without a series of its own.</summary>
    public const string Journal = "JV";

    /// <summary>Reversals of posted vouchers.</summary>
    public const string Reversal = "RV";

    /// <summary>Every series code, for validation.</summary>
    public static IReadOnlyCollection<string> All { get; } =
        [Sales, SalesReturn, Purchase, PurchaseReturn, Receipt, Payment, Contra, Opening, Journal, Reversal];

    /// <summary>The series a voucher of <paramref name="voucherType"/> is numbered in; unknown types are journals.
    /// Reversals are numbered in <see cref="Reversal"/> by the caller, whatever the reversed voucher's type.</summary>
    public static string ForVoucherType(string? voucherType) =>
        voucherType?.Trim() switch
        {
            "system_sale" => Sales,
            "system_sales_return" or "system_refund" => SalesReturn,
            "system_purchase" => Purchase,
            "system_purchase_return" => PurchaseReturn,
            "system_customer_payment" => Receipt,
            "system_supplier_payment" or "system_expense" or "system_vat_payment" => Payment,
            "system_bank_deposit" => Contra,
            OpeningBalanceRules.VoucherType or "system_opening_balance" or "system_opening_stock" => Opening,
            _ => Journal,
        };

    /// <summary>The voucher number for <paramref name="number"/> in <paramref name="series"/>, e.g. <c>SAL-000123</c>.</summary>
    public static string Format(string series, int number)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(series);
        return string.Create(CultureInfo.InvariantCulture, $"{series}-{number:D6}");
    }
}
