using FSH.Modules.Accounting.Domain;

namespace Accounting.Tests.Domain;

public sealed class AccountingVoucherTests
{
    private static AccountingVoucher CreateBalancedDraft(decimal amount = 100m)
    {
        var voucher = AccountingVoucher.CreateDraft(DateTime.UtcNow, "journal", AccountingVoucherSource.Manual, "test");
        voucher.AddLine(Guid.CreateVersion7(), "debit line", amount, 0m);
        voucher.AddLine(Guid.CreateVersion7(), "credit line", 0m, amount);
        return voucher;
    }

    #region AddLine

    [Fact]
    public void AddLine_Should_Throw_When_BothDebitAndCreditPositive()
    {
        var voucher = AccountingVoucher.CreateDraft(DateTime.UtcNow, "journal", AccountingVoucherSource.Manual, null);

        Should.Throw<FSH.Framework.Core.Exceptions.CustomException>(
            () => voucher.AddLine(Guid.CreateVersion7(), null, 10m, 10m));
    }

    [Fact]
    public void AddLine_Should_Throw_When_NeitherDebitNorCreditPositive()
    {
        var voucher = AccountingVoucher.CreateDraft(DateTime.UtcNow, "journal", AccountingVoucherSource.Manual, null);

        Should.Throw<FSH.Framework.Core.Exceptions.CustomException>(
            () => voucher.AddLine(Guid.CreateVersion7(), null, 0m, 0m));
    }

    [Fact]
    public void AddLine_Should_Throw_When_AfterPosted()
    {
        var voucher = CreateBalancedDraft();
        voucher.Post("JV-0001", "tester");

        Should.Throw<FSH.Framework.Core.Exceptions.CustomException>(
            () => voucher.AddLine(Guid.CreateVersion7(), null, 5m, 0m));
    }

    #endregion

    #region Post — the balanced-voucher invariant

    [Fact]
    public void Post_Should_Succeed_When_DebitsEqualCredits()
    {
        var voucher = CreateBalancedDraft(250m);

        voucher.Post("JV-0001", "tester");

        voucher.Status.ShouldBe(AccountingVoucherStatus.Posted);
        voucher.VoucherNo.ShouldBe("JV-0001");
        voucher.PostedBy.ShouldBe("tester");
        voucher.PostedAtUtc.ShouldNotBeNull();
    }

    [Fact]
    public void Post_Should_Throw_When_VoucherIsUnbalanced()
    {
        var voucher = AccountingVoucher.CreateDraft(DateTime.UtcNow, "journal", AccountingVoucherSource.Manual, null);
        voucher.AddLine(Guid.CreateVersion7(), "debit", 100m, 0m);
        voucher.AddLine(Guid.CreateVersion7(), "credit", 0m, 60m);

        Should.Throw<FSH.Framework.Core.Exceptions.CustomException>(() => voucher.Post("JV-0001", "tester"));
        voucher.Status.ShouldBe(AccountingVoucherStatus.Draft);
    }

    [Fact]
    public void Post_Should_Throw_When_NoLines()
    {
        var voucher = AccountingVoucher.CreateDraft(DateTime.UtcNow, "journal", AccountingVoucherSource.Manual, null);

        Should.Throw<FSH.Framework.Core.Exceptions.CustomException>(() => voucher.Post("JV-0001", "tester"));
    }

    [Fact]
    public void Post_Should_Throw_When_AlreadyPosted()
    {
        var voucher = CreateBalancedDraft();
        voucher.Post("JV-0001", "tester");

        Should.Throw<FSH.Framework.Core.Exceptions.CustomException>(() => voucher.Post("JV-0002", "tester"));
    }

    #endregion

    #region VoidVoucher

    [Fact]
    public void VoidVoucher_Should_Succeed_When_Posted()
    {
        var voucher = CreateBalancedDraft();
        voucher.Post("JV-0001", "tester");

        voucher.VoidVoucher("mistake");

        voucher.Status.ShouldBe(AccountingVoucherStatus.Void);
        voucher.VoidReason.ShouldBe("mistake");
        voucher.VoidedAtUtc.ShouldNotBeNull();
    }

    [Fact]
    public void VoidVoucher_Should_Throw_When_StillDraft()
    {
        var voucher = CreateBalancedDraft();

        Should.Throw<FSH.Framework.Core.Exceptions.CustomException>(() => voucher.VoidVoucher("mistake"));
    }

    [Fact]
    public void VoidVoucher_Should_Throw_When_AlreadyVoid()
    {
        var voucher = CreateBalancedDraft();
        voucher.Post("JV-0001", "tester");
        voucher.VoidVoucher("first");

        Should.Throw<FSH.Framework.Core.Exceptions.CustomException>(() => voucher.VoidVoucher("second"));
    }

    #endregion

    #region UpdateDraft / ClearLines

    [Fact]
    public void UpdateDraft_Should_UpdateDateAndNarration_When_StillDraft()
    {
        var voucher = CreateBalancedDraft();
        var newDate = DateTime.UtcNow.AddDays(-1);

        voucher.UpdateDraft(newDate, "updated narration");

        voucher.VoucherDateUtc.ShouldBe(newDate);
        voucher.Narration.ShouldBe("updated narration");
    }

    [Fact]
    public void UpdateDraft_Should_Throw_When_AlreadyPosted()
    {
        var voucher = CreateBalancedDraft();
        voucher.Post("JV-0001", "tester");

        Should.Throw<FSH.Framework.Core.Exceptions.CustomException>(
            () => voucher.UpdateDraft(DateTime.UtcNow, "nope"));
    }

    [Fact]
    public void ClearLines_Should_RemoveAllLines_When_StillDraft()
    {
        var voucher = CreateBalancedDraft();

        voucher.ClearLines();

        voucher.Lines.ShouldBeEmpty();
    }

    [Fact]
    public void ClearLines_Should_Throw_When_AlreadyPosted()
    {
        var voucher = CreateBalancedDraft();
        voucher.Post("JV-0001", "tester");

        Should.Throw<FSH.Framework.Core.Exceptions.CustomException>(() => voucher.ClearLines());
    }

    #endregion

    #region BranchId

    [Fact]
    public void AddLine_Should_StampLineWithVoucherBranchId()
    {
        var branchId = Guid.CreateVersion7();
        var voucher = AccountingVoucher.CreateDraft(
            DateTime.UtcNow, "journal", AccountingVoucherSource.Manual, null, branchId: branchId);

        voucher.AddLine(Guid.CreateVersion7(), "debit", 10m, 0m);

        voucher.BranchId.ShouldBe(branchId);
        voucher.Lines.Single().BranchId.ShouldBe(branchId);
    }

    [Fact]
    public void CreateDraft_Should_LeaveBranchIdNull_When_NotProvided()
    {
        var voucher = AccountingVoucher.CreateDraft(DateTime.UtcNow, "journal", AccountingVoucherSource.Manual, null);
        voucher.AddLine(Guid.CreateVersion7(), "debit", 10m, 0m);

        voucher.BranchId.ShouldBeNull();
        voucher.Lines.Single().BranchId.ShouldBeNull();
    }

    [Fact]
    public void CreateReversal_Should_CarryOriginalBranchId_ToReversalAndItsLines()
    {
        var branchId = Guid.CreateVersion7();
        var voucher = AccountingVoucher.CreateDraft(
            DateTime.UtcNow, "journal", AccountingVoucherSource.Manual, null, branchId: branchId);
        voucher.AddLine(Guid.CreateVersion7(), "debit line", 100m, 0m);
        voucher.AddLine(Guid.CreateVersion7(), "credit line", 0m, 100m);
        voucher.Post("JV-0001", "tester");

        var reversal = voucher.CreateReversal("RV-0001", "reverser", DateTime.UtcNow);

        reversal.BranchId.ShouldBe(branchId);
        reversal.Lines.ShouldAllBe(l => l.BranchId == branchId);
    }

    #endregion
}
