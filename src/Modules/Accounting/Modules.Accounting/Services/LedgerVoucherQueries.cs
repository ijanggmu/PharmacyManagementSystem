using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Services;

/// <summary>
/// The single definition of "which vouchers count in the ledger", shared by every report.
/// <para>
/// A posted voucher counts. A voucher that was <b>reversed</b> also counts, even though
/// <see cref="AccountingVoucher.CreateReversal"/> flips it to <see cref="AccountingVoucherStatus.Void"/>:
/// its reversing voucher is a separate posted entry with every line swapped, so the pair nets to zero
/// (rule.md §9.1 "void/reverse with trace"). Counting only <c>Status == Posted</c> would keep the
/// reversal but drop the original, booking the negative of the original instead of nothing.
/// </para>
/// <para>
/// A voucher voided outright (<see cref="AccountingVoucher.VoidVoucher"/>, no reversing voucher) and
/// drafts are excluded. The rule also holds along a chain: if a reversal is itself reversed, the
/// original, the reversal and the reversal-of-reversal all count (net = original). Voiding a reversal
/// outright is refused (<see cref="AccountingVoucher.VoidVoucher"/>), as is voiding a reversed voucher;
/// rows written before that rule (a reversal voided outright) still resolve here as: the original counts,
/// the voided reversal drops out (net = original).
/// </para>
/// </summary>
internal static class LedgerVoucherQueries
{
    public static IQueryable<AccountingVoucher> LedgerVouchers(this AccountingDbContext dbContext)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        return dbContext.Vouchers.AsNoTracking().Where(v =>
            v.Status == AccountingVoucherStatus.Posted
            || (v.Status == AccountingVoucherStatus.Void
                && dbContext.Vouchers.Any(r => r.ReversesVoucherId == v.Id)));
    }
}
