using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;

namespace FSH.Modules.Accounting.Services;

/// <summary>
/// Which vouchers are year-end closing entries: a closing voucher (<see cref="FiscalYearCloseRules.VoucherType"/>)
/// or the reversal of one (posted when a year is reopened). Period reports that show a year's revenue and expense
/// (the P&amp;L, period activity) leave them out so a closed year still reports its real figures; balance (as-of)
/// reports keep them, so revenue and expense read zero after the close and the profit sits in Retained Earnings.
/// </summary>
internal static class YearEndCloseVoucherQueries
{
    /// <summary>Drops closing entries (and their reversals) from <paramref name="vouchers"/>.</summary>
    public static IQueryable<AccountingVoucher> ExcludingYearEndClose(
        this IQueryable<AccountingVoucher> vouchers, AccountingDbContext dbContext)
    {
        ArgumentNullException.ThrowIfNull(vouchers);
        ArgumentNullException.ThrowIfNull(dbContext);
        var all = dbContext.Vouchers;
        return vouchers.Where(v => v.VoucherType != FiscalYearCloseRules.VoucherType
            && !(v.ReversesVoucherId != null
                && all.Any(o => o.Id == v.ReversesVoucherId && o.VoucherType == FiscalYearCloseRules.VoucherType)));
    }

    /// <summary>Keeps only closing entries (and their reversals) from <paramref name="vouchers"/>.</summary>
    public static IQueryable<AccountingVoucher> OnlyYearEndClose(
        this IQueryable<AccountingVoucher> vouchers, AccountingDbContext dbContext)
    {
        ArgumentNullException.ThrowIfNull(vouchers);
        ArgumentNullException.ThrowIfNull(dbContext);
        var all = dbContext.Vouchers;
        return vouchers.Where(v => v.VoucherType == FiscalYearCloseRules.VoucherType
            || (v.ReversesVoucherId != null
                && all.Any(o => o.Id == v.ReversesVoucherId && o.VoucherType == FiscalYearCloseRules.VoucherType)));
    }
}
