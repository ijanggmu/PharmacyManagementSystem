using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Expenses;

/// <summary>Updates a recorded expense. If it already posted a GL voucher, that voucher is
/// reversed (dated at the expense's original date, or the first open day when that is locked) and a
/// new one posted for the updated figures at the expense date — the original posted voucher is never
/// edited (rule.md §9.1). <paramref name="ExpenseDateUtc"/> moves the expense to another date when
/// set; omitted, the date is unchanged.
/// <para>The VAT fields describe the expense after the edit, as on <see cref="RecordExpenseCommand"/> (none set = no
/// VAT). <paramref name="ExpenseAccountId"/> omitted keeps the expense's current account (General Expenses for one
/// recorded before accounts could be chosen).</para>
/// <para>A pay-later expense stays owed to its supplier: <paramref name="SupplierId"/> must name the same supplier,
/// and its amount and date can't change (the bill is on the supplier's ledger) — delete and re-record it instead.
/// A paid-now expense can't be switched to pay later, or back, by an edit.</para>
/// <para>The TDS fields describe the expense after the edit, as on <see cref="RecordExpenseCommand"/> (no category =
/// no TDS). A pay-later expense's TDS is fixed too: it sets what is owed to the supplier.</para></summary>
public sealed record UpdateExpenseCommand(
    Guid ExpenseId,
    string Category,
    decimal Amount,
    string PaymentMethod,
    string? Description = null,
    string? ReceiptReference = null,
    DateTime? ExpenseDateUtc = null,
    Guid? ExpenseAccountId = null,
    decimal? VatAmount = null,
    bool AmountIncludesVat = false,
    string? SupplierVatNumber = null,
    string? VendorName = null,
    Guid? SupplierId = null,
    string? TdsCategory = null,
    decimal? TdsRatePercent = null,
    decimal? TdsAmount = null) : ICommand<Guid>;
