using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Expenses;

/// <summary>
/// Records an expense and posts its voucher at once. <paramref name="Amount"/> is the gross bill total.
/// <list type="bullet">
/// <item><paramref name="ExpenseAccountId"/> — the Expense-type ledger account debited with the net cost; omitted,
/// General Expenses (5100). <paramref name="Category"/> stays a free-text label.</item>
/// <item>VAT bill — <paramref name="VatAmount"/> is the input VAT inside <paramref name="Amount"/>, or set
/// <paramref name="AmountIncludesVat"/> to split it out at the tenant VAT rate (pharmacy settings). The VAT is
/// debited to Input VAT Recoverable (1150); a VAT bill needs the seller's <paramref name="SupplierVatNumber"/> and
/// the bill number in <paramref name="ReceiptReference"/>.</item>
/// <item>Paid now — <paramref name="PaymentMethod"/> picks the credit account: "Cash" credits Cash, anything else
/// (bank, card, other) credits Bank.</item>
/// <item>Pay later — <paramref name="SupplierId"/> set: credits Accounts Payable (2000) and adds the bill to the
/// supplier's AP ledger; <paramref name="PaymentMethod"/> is ignored. The supplier is paid through the normal
/// supplier payment flow. <paramref name="DueDateUtc"/> sets when the bill falls due (omitted, the supplier's credit
/// days decide).</item>
/// <item>TDS — <paramref name="TdsCategory"/> (a code from <c>GET /accounting/tds/categories</c>) withholds tax at
/// source: TDS is computed on the amount excluding VAT at <paramref name="TdsRatePercent"/> (omitted, the category's
/// rate) unless <paramref name="TdsAmount"/> gives it. The vendor is paid / owed the gross less TDS, and the TDS is
/// credited to TDS Payable (2150).</item>
/// </list>
/// </summary>
public sealed record RecordExpenseCommand(
    DateTime ExpenseDateUtc,
    string Category,
    decimal Amount,
    string PaymentMethod,
    string? Description = null,
    string? ReceiptReference = null,
    Guid? ExpenseAccountId = null,
    decimal? VatAmount = null,
    bool AmountIncludesVat = false,
    string? SupplierVatNumber = null,
    string? VendorName = null,
    Guid? SupplierId = null,
    string? TdsCategory = null,
    decimal? TdsRatePercent = null,
    decimal? TdsAmount = null,
    // Pay later only: when the bill falls due; null = the expense date plus the supplier's credit days.
    DateTime? DueDateUtc = null) : ICommand<Guid>;
