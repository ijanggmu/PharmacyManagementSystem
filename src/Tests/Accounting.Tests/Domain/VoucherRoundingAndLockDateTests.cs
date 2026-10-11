using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;

namespace Accounting.Tests.Domain;

/// <summary>Voucher balancing on the stored (2-decimal) amounts, and the Nepal-day posting lock.</summary>
public sealed class VoucherRoundingAndLockDateTests
{
    [Fact]
    public void Post_Should_Reject_LinesThatBalanceOnlyBeforeRounding()
    {
        // 3.125 + 3.125 = 6.25 exactly, but numeric(18,2) stores 3.13 + 3.13 = 6.26 against 6.25.
        var voucher = AccountingVoucher.CreateDraft(DateTime.UtcNow, "journal", AccountingVoucherSource.Manual, null);
        voucher.AddLine(Guid.CreateVersion7(), null, 3.125m, 0m);
        voucher.AddLine(Guid.CreateVersion7(), null, 3.125m, 0m);
        voucher.AddLine(Guid.CreateVersion7(), null, 0m, 6.25m);

        Should.Throw<CustomException>(() => voucher.Post("JV-1", "tester")).Message.ShouldContain("not balanced");
        voucher.Status.ShouldBe(AccountingVoucherStatus.Draft);
    }

    [Fact]
    public void Post_Should_StoreRoundedAmounts()
    {
        var voucher = AccountingVoucher.CreateDraft(DateTime.UtcNow, "journal", AccountingVoucherSource.Manual, null);
        voucher.AddLine(Guid.CreateVersion7(), null, 10.004m, 0m);
        voucher.AddLine(Guid.CreateVersion7(), null, 0m, 10m);

        voucher.Post("JV-1", "tester");

        voucher.Lines[0].DebitAmount.ShouldBe(10.00m);
    }

    [Fact]
    public void Post_Should_Reject_LineThatRoundsToZero()
    {
        var voucher = AccountingVoucher.CreateDraft(DateTime.UtcNow, "journal", AccountingVoucherSource.Manual, null);
        voucher.AddLine(Guid.CreateVersion7(), null, 0.004m, 0m);
        voucher.AddLine(Guid.CreateVersion7(), null, 0m, 0.004m);

        Should.Throw<CustomException>(() => voucher.Post("JV-1", "tester"));
    }

    [Fact]
    public void CreateReversal_Should_KeepTheOriginalsSource()
    {
        var voucher = AccountingVoucher.CreateDraft(DateTime.UtcNow, "system_sale", AccountingVoucherSource.System, null);
        voucher.AddLine(Guid.CreateVersion7(), null, 5m, 0m);
        voucher.AddLine(Guid.CreateVersion7(), null, 0m, 5m);
        voucher.Post("SV-1", "system");

        var reversal = voucher.CreateReversal("RV-1", "system", DateTime.UtcNow, "cancelled");

        reversal.Source.ShouldBe(AccountingVoucherSource.System);
        reversal.Narration.ShouldBe("Reversal of SV-1: cancelled");
    }

    [Theory]
    // 18:14 UTC on the 10th = 23:59 NPT on the 10th (locked); 18:15 UTC = 00:00 NPT on the 11th (open).
    [InlineData("2026-01-10T18:14:00Z", false)]
    [InlineData("2026-01-10T18:15:00Z", true)]
    [InlineData("2026-01-10T03:00:00Z", false)]
    public void PostingLock_Should_CompareNepalCalendarDays(string voucherUtc, bool open)
    {
        var lockRow = AccountingPostingLock.CreateEmpty();
        lockRow.SetLockDate(new DateOnly(2026, 1, 10), "tester");
        var instant = DateTime.Parse(voucherUtc, System.Globalization.CultureInfo.InvariantCulture,
            System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal);

        if (open)
        {
            Should.NotThrow(() => lockRow.AssertOpen(NepalDate.FromUtc(instant)));
        }
        else
        {
            Should.Throw<CustomException>(() => lockRow.AssertOpen(NepalDate.FromUtc(instant)));
        }
    }

    [Fact]
    public void NepalDate_Should_RoundTripDayBounds()
    {
        var day = new DateOnly(2026, 7, 17);

        NepalDate.StartUtc(day).ShouldBe(new DateTime(2026, 7, 16, 18, 15, 0, DateTimeKind.Utc));
        NepalDate.FromUtc(NepalDate.StartUtc(day)).ShouldBe(day);
        NepalDate.FromUtc(NepalDate.EndExclusiveUtc(day).AddTicks(-1)).ShouldBe(day);
    }
}
