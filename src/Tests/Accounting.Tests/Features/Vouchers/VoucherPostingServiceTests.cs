using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;

namespace Accounting.Tests.Features.Vouchers;

/// <summary>
/// <see cref="VoucherPostingService"/>: lines are rounded to the stored 2 decimals and a sub-tolerance
/// residual goes to Rounding Off (so the stored voucher always balances), vouchers carry the business
/// date, locked dates move to the first open day, and system flows reverse rather than void.
/// </summary>
public sealed class VoucherPostingServiceTests : IDisposable
{
    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();
    private readonly IAccountingVoucherNumbers _numbers = Substitute.For<IAccountingVoucherNumbers>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly IBranchService _branchService = Substitute.For<IBranchService>();
    private int _next;

    public VoucherPostingServiceTests()
    {
        _numbers.ReserveNextNumberAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(_ => Task.FromResult(++_next));
    }

    public void Dispose() => _db.Dispose();

    private VoucherPostingService Sut() =>
        new(_db, _numbers, new AccountingPostingLockService(_db), _currentBranch, _branchService, NullLogger<VoucherPostingService>.Instance);

    private async Task<(Guid Cash, Guid Bank, Guid Revenue)> ChartAsync()
    {
        var cash = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.Cash, AccountingAccountType.Asset, isSystem: true);
        var bank = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.Bank, AccountingAccountType.Asset, isSystem: true);
        var revenue = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.SalesRevenue, AccountingAccountType.Revenue, isSystem: true);
        await AccountingTestChart.RootAsync(_db, AccountingAccountType.Expense);
        return (cash.Id, bank.Id, revenue.Id);
    }

    private static PostVoucherRequest Request(IReadOnlyList<PostVoucherLine> lines, DateTime? dateUtc = null, Guid? referenceId = null) =>
        new("system_sale", "Sale", referenceId ?? Guid.CreateVersion7(), "Sale", lines, Guid.CreateVersion7(), dateUtc);

    private async Task LockBooksAsync(DateOnly lockDate)
    {
        var lockRow = await new AccountingPostingLockService(_db).GetOrCreateAsync();
        lockRow.SetLockDate(lockDate, "tester");
        await _db.SaveChangesAsync();
    }

    [Fact]
    public async Task Post_Should_BookOnePaisaResidual_ToRoundingOff_When_TenderLegsUnderpayByOnePaisa()
    {
        var (cash, bank, revenue) = await ChartAsync();

        var id = await Sut().PostSystemVoucherAsync(Request(
        [
            new PostVoucherLine(revenue, "Sale revenue", 0m, 100.00m),
            new PostVoucherLine(cash, "Cash", 50m, 0m),
            new PostVoucherLine(bank, "Card", 49.99m, 0m),
        ]));

        var voucher = await _db.Vouchers.Include(v => v.Lines).SingleAsync(v => v.Id == id);
        var rounding = await _db.Accounts.SingleAsync(a => a.Code == AccountingSystemAccountCodes.RoundingOff);
        voucher.Status.ShouldBe(AccountingVoucherStatus.Posted);
        voucher.Lines.Sum(l => l.DebitAmount).ShouldBe(voucher.Lines.Sum(l => l.CreditAmount));
        var roundingLine = voucher.Lines.Single(l => l.AccountId == rounding.Id);
        roundingLine.DebitAmount.ShouldBe(0.01m);
        roundingLine.CreditAmount.ShouldBe(0m);
        rounding.IsSystem.ShouldBeTrue();
        rounding.AccountType.ShouldBe(AccountingAccountType.Expense);
    }

    [Fact]
    public async Task Post_Should_RoundThreeDecimalLines_And_BalanceTheStoredAmounts()
    {
        var (cash, bank, revenue) = await ChartAsync();

        var id = await Sut().PostSystemVoucherAsync(Request(
        [
            new PostVoucherLine(cash, "Cash", 3.125m, 0m),
            new PostVoucherLine(bank, "Card", 3.125m, 0m),
            new PostVoucherLine(revenue, "Sale revenue", 0m, 6.25m),
        ]));

        var voucher = await _db.Vouchers.Include(v => v.Lines).SingleAsync(v => v.Id == id);
        voucher.Lines.ShouldAllBe(l => l.DebitAmount == Math.Round(l.DebitAmount, 2) && l.CreditAmount == Math.Round(l.CreditAmount, 2));
        voucher.Lines.Sum(l => l.DebitAmount).ShouldBe(6.26m);
        voucher.Lines.Sum(l => l.CreditAmount).ShouldBe(6.26m);
        voucher.Lines.Single(l => l.Description == "Rounding off").CreditAmount.ShouldBe(0.01m);
    }

    [Fact]
    public async Task Post_Should_Reject_When_DifferenceIsMoreThanRounding()
    {
        var (cash, _, revenue) = await ChartAsync();

        await Should.ThrowAsync<CustomException>(() => Sut().PostSystemVoucherAsync(Request(
        [
            new PostVoucherLine(cash, "Cash", 90m, 0m),
            new PostVoucherLine(revenue, "Sale revenue", 0m, 100m),
        ])).AsTask());

        (await _db.Vouchers.AnyAsync()).ShouldBeFalse();
    }

    [Fact]
    public async Task Post_Should_DateVoucher_AtTheBusinessDate()
    {
        var (cash, _, revenue) = await ChartAsync();
        var saleDate = new DateTime(2026, 3, 14, 9, 30, 0, DateTimeKind.Utc);

        var id = await Sut().PostSystemVoucherAsync(Request(
            [new PostVoucherLine(cash, "Cash", 10m, 0m), new PostVoucherLine(revenue, "Revenue", 0m, 10m)], saleDate));

        (await _db.Vouchers.SingleAsync(v => v.Id == id)).VoucherDateUtc.ShouldBe(saleDate);
    }

    [Fact]
    public async Task Post_Should_MoveALockedBusinessDate_ToTheFirstOpenDay()
    {
        var (cash, _, revenue) = await ChartAsync();
        await LockBooksAsync(new DateOnly(2026, 3, 31));

        var id = await Sut().PostSystemVoucherAsync(Request(
            [new PostVoucherLine(cash, "Cash", 10m, 0m), new PostVoucherLine(revenue, "Revenue", 0m, 10m)],
            new DateTime(2026, 3, 14, 9, 30, 0, DateTimeKind.Utc)));

        var voucher = await _db.Vouchers.SingleAsync(v => v.Id == id);
        NepalDate.FromUtc(voucher.VoucherDateUtc).ShouldBeGreaterThan(new DateOnly(2026, 3, 31));
    }

    [Fact]
    public async Task ReverseSystemVoucher_Should_KeepOriginal_And_DateReversalAtCancellation()
    {
        var (cash, _, revenue) = await ChartAsync();
        var saleId = Guid.CreateVersion7();
        var saleDate = new DateTime(2026, 4, 2, 6, 0, 0, DateTimeKind.Utc);
        var cancelDate = new DateTime(2026, 4, 5, 6, 0, 0, DateTimeKind.Utc);
        var originalId = await Sut().PostSystemVoucherAsync(Request(
            [new PostVoucherLine(cash, "Cash", 10m, 0m), new PostVoucherLine(revenue, "Revenue", 0m, 10m)], saleDate, saleId));

        var reversalId = await Sut().ReverseSystemVoucherAsync("Sale", saleId, "customer changed mind", cancelDate);

        reversalId.ShouldNotBeNull();
        var reversal = await _db.Vouchers.Include(v => v.Lines).SingleAsync(v => v.Id == reversalId);
        reversal.VoucherDateUtc.ShouldBe(cancelDate);
        reversal.ReversesVoucherId.ShouldBe(originalId);
        reversal.Source.ShouldBe(AccountingVoucherSource.System);
        reversal.Narration!.ShouldContain("customer changed mind");
        reversal.Lines.Single(l => l.AccountId == cash).CreditAmount.ShouldBe(10m);
        var original = await _db.Vouchers.SingleAsync(v => v.Id == originalId);
        original.VoucherDateUtc.ShouldBe(saleDate);

        // Original + reversal both stay in the ledger: the sale's period still shows the sale.
        original.Status.ShouldBe(AccountingVoucherStatus.Void);
        original.VoidReason!.ShouldContain(reversal.VoucherNo);

        // Redelivered cancellation: nothing left to reverse.
        (await Sut().ReverseSystemVoucherAsync("Sale", saleId, "again", cancelDate)).ShouldBeNull();
        (await _db.Vouchers.CountAsync()).ShouldBe(2);
    }

    [Fact]
    public async Task Post_Should_NumberEachVoucherInItsTypeSeries_And_ReversalsInTheReversalSeries()
    {
        var (cash, _, revenue) = await ChartAsync();
        var saleId = Guid.CreateVersion7();
        var saleId2 = Guid.CreateVersion7();
        var receiptId = Guid.CreateVersion7();
        var saleDate = DateTime.UtcNow;

        var saleVoucherId = await Sut().PostSystemVoucherAsync(Request(
            [new PostVoucherLine(cash, "Cash", 10m, 0m), new PostVoucherLine(revenue, "Revenue", 0m, 10m)], saleDate, saleId));
        await Sut().PostSystemVoucherAsync(new PostVoucherRequest(
            "system_customer_payment", "CustomerPayment", receiptId, "Receipt",
            [new PostVoucherLine(cash, "Cash", 5m, 0m), new PostVoucherLine(revenue, "Revenue", 0m, 5m)], Guid.CreateVersion7(), saleDate));
        await Sut().PostSystemVoucherAsync(Request(
            [new PostVoucherLine(cash, "Cash", 7m, 0m), new PostVoucherLine(revenue, "Revenue", 0m, 7m)], saleDate, saleId2));
        var reversalId = await Sut().ReverseSystemVoucherAsync("Sale", saleId, "cancelled", saleDate);

        Received.InOrder(() =>
        {
            _numbers.ReserveNextNumberAsync(VoucherSeries.Sales, Arg.Any<CancellationToken>());
            _numbers.ReserveNextNumberAsync(VoucherSeries.Receipt, Arg.Any<CancellationToken>());
            _numbers.ReserveNextNumberAsync(VoucherSeries.Sales, Arg.Any<CancellationToken>());
            _numbers.ReserveNextNumberAsync(VoucherSeries.Reversal, Arg.Any<CancellationToken>());
        });
        (await _db.Vouchers.SingleAsync(v => v.Id == saleVoucherId)).VoucherNo.ShouldBe("SAL-000001");
        (await _db.Vouchers.SingleAsync(v => v.ReferenceId == receiptId)).VoucherNo.ShouldBe("RCT-000002");
        (await _db.Vouchers.SingleAsync(v => v.ReferenceId == saleId2)).VoucherNo.ShouldBe("SAL-000003");
        (await _db.Vouchers.SingleAsync(v => v.Id == reversalId)).VoucherNo.ShouldBe("RV-000004");
    }

    [Fact]
    public async Task ReverseSystemVoucher_Should_DateReversalInOpenPeriod_When_CancellationDateIsLocked()
    {
        var (cash, _, revenue) = await ChartAsync();
        var saleId = Guid.CreateVersion7();
        var saleDate = new DateTime(2026, 4, 2, 6, 0, 0, DateTimeKind.Utc);
        await Sut().PostSystemVoucherAsync(Request(
            [new PostVoucherLine(cash, "Cash", 10m, 0m), new PostVoucherLine(revenue, "Revenue", 0m, 10m)], saleDate, saleId));
        await LockBooksAsync(new DateOnly(2026, 4, 30));

        var reversalId = await Sut().ReverseSystemVoucherAsync("Sale", saleId, "late cancel", new DateTime(2026, 4, 10, 6, 0, 0, DateTimeKind.Utc));

        var reversal = await _db.Vouchers.SingleAsync(v => v.Id == reversalId);
        NepalDate.FromUtc(reversal.VoucherDateUtc).ShouldBeGreaterThan(new DateOnly(2026, 4, 30));
    }

    private async Task<Guid> VoidPostedDirectGoodsReceiptAsync(DateTime voidedAtUtc, DateTime deliveredAtUtc, DateOnly? lockDate)
    {
        var (cash, _, revenue) = await ChartAsync();
        var receiptId = Guid.CreateVersion7();
        var receiptDate = new DateTime(2026, 4, 2, 6, 0, 0, DateTimeKind.Utc);
        var originalId = await Sut().PostSystemVoucherAsync(new PostVoucherRequest(
            "system_purchase", "DirectGoodsReceipt", receiptId, "Receipt",
            [new PostVoucherLine(cash, "Stock", 10m, 0m), new PostVoucherLine(revenue, "AP", 0m, 10m)],
            Guid.CreateVersion7(), receiptDate));
        if (lockDate is { } locked)
        {
            await LockBooksAsync(locked);
        }

        await new FSH.Modules.Accounting.IntegrationEventHandlers.DirectGoodsReceiptVoidedIntegrationEventHandler(Sut())
            .HandleAsync(new FSH.Modules.Purchasing.Contracts.Events.DirectGoodsReceiptVoidedIntegrationEvent(
                Guid.NewGuid(), deliveredAtUtc, "t", "c", "Purchasing", receiptId, Guid.CreateVersion7(), 10m, receiptDate,
                "wrong supplier", VoidedAtUtc: voidedAtUtc));

        return (await _db.Vouchers.SingleAsync(v => v.ReversesVoucherId == originalId)).Id;
    }

    [Fact]
    public async Task DirectGoodsReceiptVoided_Should_DateReversalAtTheVoid_NotAtTheEventDelivery()
    {
        var voidedAt = new DateTime(2026, 4, 10, 6, 0, 0, DateTimeKind.Utc);

        var reversalId = await VoidPostedDirectGoodsReceiptAsync(voidedAt, deliveredAtUtc: voidedAt.AddDays(3), lockDate: null);

        (await _db.Vouchers.SingleAsync(v => v.Id == reversalId)).VoucherDateUtc.ShouldBe(voidedAt);
    }

    [Fact]
    public async Task DirectGoodsReceiptVoided_Should_MoveReversalToTheOpenPeriod_When_TheVoidDateIsLocked()
    {
        var reversalId = await VoidPostedDirectGoodsReceiptAsync(
            new DateTime(2026, 4, 10, 6, 0, 0, DateTimeKind.Utc), new DateTime(2026, 4, 12, 6, 0, 0, DateTimeKind.Utc),
            lockDate: new DateOnly(2026, 4, 30));

        NepalDate.FromUtc((await _db.Vouchers.SingleAsync(v => v.Id == reversalId)).VoucherDateUtc)
            .ShouldBeGreaterThan(new DateOnly(2026, 4, 30));
    }

    [Fact]
    public async Task Void_Should_Refuse_SystemVouchers()
    {
        var (cash, _, revenue) = await ChartAsync();
        var id = await Sut().PostSystemVoucherAsync(Request(
            [new PostVoucherLine(cash, "Cash", 10m, 0m), new PostVoucherLine(revenue, "Revenue", 0m, 10m)]));

        (await Should.ThrowAsync<CustomException>(() => Sut().VoidAsync(id, "oops").AsTask())).Message.ShouldContain("system");
        (await _db.Vouchers.SingleAsync(v => v.Id == id)).Status.ShouldBe(AccountingVoucherStatus.Posted);
    }

    [Fact]
    public async Task Void_Should_Refuse_ManualVoucher_DatedInLockedPeriod()
    {
        var (cash, _, revenue) = await ChartAsync();
        var voucher = await VoucherSeed.PostedAsync(
            _db, new DateTime(2026, 4, 2, 6, 0, 0, DateTimeKind.Utc), "MJ-001", cash, revenue, 10m,
            voucherType: "journal", source: AccountingVoucherSource.Manual);
        await LockBooksAsync(new DateOnly(2026, 4, 30));

        (await Should.ThrowAsync<CustomException>(() => Sut().VoidAsync(voucher.Id, "oops").AsTask())).Message.ShouldContain("closed");
    }

    [Fact]
    public async Task Void_Should_Void_OpenManualVoucher()
    {
        var (cash, _, revenue) = await ChartAsync();
        var voucher = await VoucherSeed.PostedAsync(
            _db, DateTime.UtcNow, "MJ-001", cash, revenue, 10m, voucherType: "journal", source: AccountingVoucherSource.Manual);

        await Sut().VoidAsync(voucher.Id, "typo");

        (await _db.Vouchers.SingleAsync(v => v.Id == voucher.Id)).Status.ShouldBe(AccountingVoucherStatus.Void);
    }

    [Fact]
    public async Task Post_Should_NotRepost_When_TheVoucherWasPostedAndThenReversed()
    {
        var (cash, _, revenue) = await ChartAsync();
        var saleId = Guid.CreateVersion7();
        var request = Request([new PostVoucherLine(cash, "Cash", 10m, 0m), new PostVoucherLine(revenue, "Revenue", 0m, 10m)],
            new DateTime(2026, 4, 2, 6, 0, 0, DateTimeKind.Utc), saleId);
        var originalId = await Sut().PostSystemVoucherAsync(request);
        await Sut().ReverseSystemVoucherAsync("Sale", saleId, "cancelled", new DateTime(2026, 4, 3, 6, 0, 0, DateTimeKind.Utc));

        // SaleCompleted redelivered after SaleCancelled was handled: the reversed (Void) voucher counts as booked.
        (await Sut().PostSystemVoucherAsync(request)).ShouldBe(originalId);

        (await _db.Vouchers.CountAsync()).ShouldBe(2);
        (await _db.Vouchers.CountAsync(v => v.Status == AccountingVoucherStatus.Posted && v.ReferenceType == "Sale")).ShouldBe(0);
    }

    [Fact]
    public async Task ReverseBeforePost_Should_RecordTombstone_ThenPostAndReverseAtOnce_When_TheOriginalArrives()
    {
        var (cash, _, revenue) = await ChartAsync();
        var saleId = Guid.CreateVersion7();
        var saleDate = new DateTime(2026, 4, 2, 6, 0, 0, DateTimeKind.Utc);
        var cancelDate = new DateTime(2026, 4, 3, 6, 0, 0, DateTimeKind.Utc);

        // SaleCancelled is handled first (the first SaleCompleted delivery failed and is retried later).
        (await Sut().ReverseSystemVoucherAsync("Sale", saleId, "wrong item", cancelDate)).ShouldBeNull();
        (await _db.Vouchers.AnyAsync()).ShouldBeFalse();
        var tombstone = await _db.PendingReversals.SingleAsync();
        tombstone.ReferenceId.ShouldBe(saleId);
        tombstone.ResolvedAtUtc.ShouldBeNull();

        // Redelivered cancellation: still one tombstone.
        (await Sut().ReverseSystemVoucherAsync("Sale", saleId, "wrong item", cancelDate)).ShouldBeNull();
        (await _db.PendingReversals.CountAsync()).ShouldBe(1);

        var request = Request([new PostVoucherLine(cash, "Cash", 10m, 0m), new PostVoucherLine(revenue, "Revenue", 0m, 10m)], saleDate, saleId);
        var originalId = await Sut().PostSystemVoucherAsync(request);

        var original = await _db.Vouchers.SingleAsync(v => v.Id == originalId);
        original.Status.ShouldBe(AccountingVoucherStatus.Void);
        original.VoucherDateUtc.ShouldBe(saleDate);
        var reversal = await _db.Vouchers.Include(v => v.Lines).SingleAsync(v => v.ReversesVoucherId == originalId);
        reversal.Status.ShouldBe(AccountingVoucherStatus.Posted);
        reversal.VoucherDateUtc.ShouldBe(cancelDate);
        reversal.Narration!.ShouldContain("wrong item");
        reversal.Lines.Single(l => l.AccountId == cash).CreditAmount.ShouldBe(10m);
        (await _db.PendingReversals.SingleAsync()).ReversalVoucherId.ShouldBe(reversal.Id);

        // Late redeliveries of either event change nothing.
        (await Sut().PostSystemVoucherAsync(request)).ShouldBe(originalId);
        (await Sut().ReverseSystemVoucherAsync("Sale", saleId, "again", cancelDate)).ShouldBeNull();
        (await _db.Vouchers.CountAsync()).ShouldBe(2);
        (await _db.PendingReversals.CountAsync()).ShouldBe(1);
    }

    [Fact]
    public async Task ReverseBeforePost_Should_DateTheReversalNoEarlierThanTheOriginal()
    {
        var (cash, _, revenue) = await ChartAsync();
        var receiptId = Guid.CreateVersion7();
        var receiptDate = new DateTime(2026, 4, 5, 6, 0, 0, DateTimeKind.Utc);

        await Sut().ReverseSystemVoucherAsync("DirectGoodsReceipt", receiptId, "void", new DateTime(2026, 4, 1, 6, 0, 0, DateTimeKind.Utc));
        var originalId = await Sut().PostSystemVoucherAsync(new PostVoucherRequest(
            "system_purchase", "DirectGoodsReceipt", receiptId, "Receipt",
            [new PostVoucherLine(cash, "Cash", 0m, 10m), new PostVoucherLine(revenue, "Stock", 10m, 0m)], Guid.CreateVersion7(), receiptDate));

        (await _db.Vouchers.SingleAsync(v => v.ReversesVoucherId == originalId)).VoucherDateUtc.ShouldBe(receiptDate);
    }

    [Theory]
    [InlineData(2, 0.01, true)]
    [InlineData(2, 0.02, false)]
    [InlineData(4, 0.02, true)]
    [InlineData(4, 0.03, false)]
    public async Task Post_Should_AbsorbAtMostHalfAPaisaPerLine(int debitLines, double residual, bool absorbed)
    {
        var (cash, _, revenue) = await ChartAsync();
        decimal shortBy = (decimal)residual;
        var lines = new List<PostVoucherLine> { new(revenue, "Revenue", 0m, 100m) };
        for (int i = 0; i < debitLines - 1; i++)
        {
            lines.Add(new PostVoucherLine(cash, "Cash", 10m, 0m));
        }

        lines.Add(new PostVoucherLine(cash, "Cash", 100m - (10m * (debitLines - 1)) - shortBy, 0m));
        int lineCount = lines.Count;

        if (absorbed)
        {
            var id = await Sut().PostSystemVoucherAsync(Request(lines));
            var voucher = await _db.Vouchers.Include(v => v.Lines).SingleAsync(v => v.Id == id);
            voucher.Lines.Count.ShouldBe(lineCount + 1);
            voucher.Lines.Single(l => l.Description == "Rounding off").CreditAmount.ShouldBe(0m);
            voucher.Lines.Single(l => l.Description == "Rounding off").DebitAmount.ShouldBe(shortBy);
        }
        else
        {
            await Should.ThrowAsync<CustomException>(() => Sut().PostSystemVoucherAsync(Request(lines)).AsTask());
        }
    }

    [Fact]
    public void MaxRoundingResidual_Should_BeHalfAPaisaPerLine_WithAOnePaisaFloor()
    {
        VoucherPostingService.MaxRoundingResidual(1).ShouldBe(0.01m);
        VoucherPostingService.MaxRoundingResidual(2).ShouldBe(0.01m);
        VoucherPostingService.MaxRoundingResidual(3).ShouldBe(0.015m);
        VoucherPostingService.MaxRoundingResidual(10).ShouldBe(0.05m);
    }

    [Fact]
    public async Task Post_Should_UseTheSeededSystemRoundingAccount()
    {
        var (cash, bank, revenue) = await ChartAsync();
        var seeded = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.RoundingOff, AccountingAccountType.Expense, isSystem: true);

        var id = await Sut().PostSystemVoucherAsync(Request(
            [new PostVoucherLine(revenue, "Revenue", 0m, 100m), new PostVoucherLine(cash, "Cash", 50m, 0m), new PostVoucherLine(bank, "Card", 49.99m, 0m)]));

        (await _db.Vouchers.Include(v => v.Lines).SingleAsync(v => v.Id == id)).Lines.ShouldContain(l => l.AccountId == seeded.Id);
        (await _db.Accounts.CountAsync(a => a.Code == AccountingSystemAccountCodes.RoundingOff)).ShouldBe(1);
    }

    [Fact]
    public async Task Post_Should_Refuse_When_TheRoundingCodeBelongsToAUserAccount()
    {
        var (cash, bank, revenue) = await ChartAsync();
        await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.RoundingOff, AccountingAccountType.Expense, isSystem: false);

        var ex = await Should.ThrowAsync<CustomException>(() => Sut().PostSystemVoucherAsync(Request(
            [new PostVoucherLine(revenue, "Revenue", 0m, 100m), new PostVoucherLine(cash, "Cash", 50m, 0m), new PostVoucherLine(bank, "Card", 49.99m, 0m)])).AsTask());

        ex.Message.ShouldContain(AccountingSystemAccountCodes.RoundingOff);
        (await _db.Vouchers.AnyAsync()).ShouldBeFalse();
    }

    [Fact]
    public async Task Reverse_Should_Refuse_SystemVouchers()
    {
        var (cash, _, revenue) = await ChartAsync();
        var id = await Sut().PostSystemVoucherAsync(Request(
            [new PostVoucherLine(cash, "Cash", 10m, 0m), new PostVoucherLine(revenue, "Revenue", 0m, 10m)]));

        (await Should.ThrowAsync<CustomException>(() => Sut().ReverseAsync(id, "accountant").AsTask())).Message.ShouldContain("system");
        (await _db.Vouchers.SingleAsync(v => v.Id == id)).Status.ShouldBe(AccountingVoucherStatus.Posted);
    }

    [Fact]
    public async Task Reverse_Should_Refuse_AReversalDatedBeforeTheVoucher()
    {
        var (cash, _, revenue) = await ChartAsync();
        var voucher = await VoucherSeed.PostedAsync(
            _db, new DateTime(2026, 6, 10, 6, 0, 0, DateTimeKind.Utc), "MJ-001", cash, revenue, 10m,
            voucherType: "journal", source: AccountingVoucherSource.Manual);

        await Should.ThrowAsync<CustomException>(() =>
            Sut().ReverseAsync(voucher.Id, "accountant", new DateTime(2026, 6, 9, 6, 0, 0, DateTimeKind.Utc)).AsTask());

        // Same Nepal day (June 10 NPT), earlier instant: allowed, kept at the original's instant.
        var reversalId = await Sut().ReverseAsync(voucher.Id, "accountant", new DateTime(2026, 6, 9, 19, 0, 0, DateTimeKind.Utc));
        (await _db.Vouchers.SingleAsync(v => v.Id == reversalId)).VoucherDateUtc.ShouldBe(voucher.VoucherDateUtc);
    }

    [Fact]
    public async Task ResolveOpenDate_Should_NeverDateAfterNow_And_Refuse_ALegacyLockOnTodayOrLater()
    {
        var lockService = new AccountingPostingLockService(_db);
        await LockBooksAsync(NepalDate.FromUtc(DateTime.UtcNow).AddDays(-30));
        var resolved = await lockService.ResolveOpenDateAsync(DateTime.UtcNow.AddDays(-60));
        resolved.ShouldBeLessThanOrEqualTo(DateTime.UtcNow);
        NepalDate.FromUtc(resolved).ShouldBeGreaterThan(NepalDate.FromUtc(DateTime.UtcNow).AddDays(-30));

        // A lock row still holding today (set before the validator existed): no open day up to now.
        await LockBooksAsync(NepalDate.FromUtc(DateTime.UtcNow));
        await Should.ThrowAsync<CustomException>(() => lockService.ResolveOpenDateAsync(DateTime.UtcNow.AddDays(-1)));
    }
}
