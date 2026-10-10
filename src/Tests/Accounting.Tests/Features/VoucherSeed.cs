using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;

namespace Accounting.Tests.Features;

/// <summary>Seeds balanced two-line vouchers for report and register tests.</summary>
internal static class VoucherSeed
{
    public static async Task<AccountingVoucher> PostedAsync(
        AccountingDbContext db,
        DateTime dateUtc,
        string voucherNo,
        Guid debitAccountId,
        Guid creditAccountId,
        decimal amount,
        string voucherType = "system_sale",
        AccountingVoucherSource source = AccountingVoucherSource.System,
        Guid? branchId = null,
        string? narration = null)
    {
        var voucher = AccountingVoucher.CreateDraft(dateUtc, voucherType, source, narration ?? voucherNo, branchId: branchId);
        voucher.AddLine(debitAccountId, null, amount, 0m);
        voucher.AddLine(creditAccountId, null, 0m, amount);
        voucher.Post(voucherNo, "tester");
        db.Vouchers.Add(voucher);
        await db.SaveChangesAsync();
        return voucher;
    }

    public static async Task<AccountingVoucher> DraftAsync(
        AccountingDbContext db, DateTime dateUtc, Guid debitAccountId, Guid creditAccountId, decimal amount)
    {
        var voucher = AccountingVoucher.CreateDraft(dateUtc, "journal", AccountingVoucherSource.Manual, "draft");
        voucher.AddLine(debitAccountId, null, amount, 0m);
        voucher.AddLine(creditAccountId, null, 0m, amount);
        db.Vouchers.Add(voucher);
        await db.SaveChangesAsync();
        return voucher;
    }

    /// <summary>Reverses a tracked posted voucher the way VoucherPostingService.ReverseAsync does.</summary>
    public static async Task<AccountingVoucher> ReverseAsync(
        AccountingDbContext db, AccountingVoucher original, string reversalNo, DateTime reversalDateUtc)
    {
        var reversal = original.CreateReversal(reversalNo, "tester", reversalDateUtc);
        db.Vouchers.Add(reversal);
        await db.SaveChangesAsync();
        return reversal;
    }

    public static async Task VoidAsync(AccountingDbContext db, AccountingVoucher voucher, string reason)
    {
        voucher.VoidVoucher(reason);
        await db.SaveChangesAsync();
    }
}
