using Accounting.Tests.Features.Reports;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.Events;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.FixedAssets;
using FSH.Modules.Accounting.Features.v1.FixedAssets.CreateFixedAsset;
using FSH.Modules.Accounting.Features.v1.FixedAssets.DeleteFixedAsset;
using FSH.Modules.Accounting.Features.v1.FixedAssets.DisposeFixedAsset;
using FSH.Modules.Accounting.Features.v1.FixedAssets.GetDepreciationPreview;
using FSH.Modules.Accounting.Features.v1.FixedAssets.GetDepreciationSchedule;
using FSH.Modules.Accounting.Features.v1.FixedAssets.GetTaxDepreciationSchedule;
using FSH.Modules.Accounting.Features.v1.FixedAssets.ReverseDepreciationRun;
using FSH.Modules.Accounting.Features.v1.FixedAssets.RunDepreciation;
using FSH.Modules.Accounting.Features.v1.FixedAssets.UpdateFixedAsset;
using FSH.Modules.Accounting.Features.v1.Reports.GetVatReturn;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using Mediator;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;

namespace Accounting.Tests.Features.FixedAssets;

/// <summary>
/// The fixed asset register end to end against a real voucher posting service: acquisitions (paid now with VAT, supplier
/// bill, opening), depreciation runs (preview = run, idempotent, whole-year after a month, reversal), disposals with gain
/// and loss, and the system accounts created on first use. Every voucher must balance, and the Fixed Assets and
/// Accumulated Depreciation accounts must agree with the register.
/// </summary>
public sealed class FixedAssetPostingTests : IDisposable
{
    // FY 2082/83 starts on 17 Jul 2025 (1 Shrawan 2082). Shrawan 17 Jul–16 Aug, Bhadra 17 Aug–16 Sep, Ashwin 17 Sep–17 Oct,
    // Kartik 18 Oct–16 Nov.
    private static readonly DateTime Shrawan = new(2025, 7, 20, 0, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime Kartik = new(2025, 10, 20, 0, 0, 0, DateTimeKind.Utc);

    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();
    private readonly ICurrentUser _user = Substitute.For<ICurrentUser>();
    private readonly ICurrentBranch _branch = Substitute.For<ICurrentBranch>();
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly FixedClock _clock = new(new DateTimeOffset(2026, 10, 13, 6, 0, 0, TimeSpan.Zero));
    private readonly Guid _supplierId = Guid.CreateVersion7();

    private AccountingAccount _bank = default!;
    private AccountingAccount _payable = default!;
    private AccountingAccount _equity = default!;
    private AccountingAccount _inputVat = default!;

    public FixedAssetPostingTests()
    {
        _user.Name.Returns("accountant1");
        _branch.CanViewAllBranchesAsync(Arg.Any<CancellationToken>()).Returns(true);
        _mediator.Send(Arg.Is<GetSupplierByIdQuery>(q => q.SupplierId == _supplierId), Arg.Any<CancellationToken>())
            .Returns(new SupplierDto(_supplierId, "Kathmandu Electronics", null, null, null, null, "601111222", 0m, true, DateTime.UtcNow, null));
        _mediator.Send(Arg.Any<GetSupplierOpenBillsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new SupplierOpenBillsDto(_supplierId, 0m, 0m, []));
    }

    public void Dispose() => _db.Dispose();

    private async Task SeedChartAsync()
    {
        await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.Cash, AccountingAccountType.Asset, isSystem: true);
        _bank = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.Bank, AccountingAccountType.Asset, isSystem: true);
        _inputVat = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.InputVatRecoverable, AccountingAccountType.Asset, isSystem: true);
        _payable = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.AccountsPayable, AccountingAccountType.Liability, isSystem: true);
        _equity = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.OwnersEquity, AccountingAccountType.Equity, isSystem: true);
    }

    private AccountingAccountResolver Resolver => new(_db);

    private CreateFixedAssetCommandHandler Create() =>
        new(_db, TestVoucherPosting.Create(_db), Resolver, TestPaymentAccounts.For(Resolver, _db), _user, _branch,
            new AccountingPostingLockService(_db), _mediator, _outbox);

    private RunDepreciationCommandHandler Run() =>
        new(_db, TestVoucherPosting.Create(_db), new AccountingPostingLockService(_db), _user, _branch, _clock,
            NullLogger<RunDepreciationCommandHandler>.Instance);

    private GetDepreciationPreviewQueryHandler Preview() => new(_db, new AccountingPostingLockService(_db), _branch, _clock);

    private DisposeFixedAssetCommandHandler Disposal() =>
        new(_db, TestVoucherPosting.Create(_db), TestPaymentAccounts.For(Resolver, _db), Resolver, _branch, new AccountingPostingLockService(_db));

    private Task<AccountingAccount> AccountAsync(string code) => _db.Accounts.SingleAsync(a => a.Code == code);

    private async Task<decimal> NetAsync(string code)
    {
        var account = await AccountAsync(code);
        return (await _db.VoucherLines.Where(l => l.AccountId == account.Id).ToListAsync()).Sum(l => l.DebitAmount - l.CreditAmount);
    }

    private async Task<List<AccountingVoucherLine>> PostedLinesAsync(string referenceType, Guid referenceId)
    {
        var voucher = await _db.Vouchers.Include(v => v.Lines)
            .SingleAsync(v => v.ReferenceType == referenceType && v.ReferenceId == referenceId && v.Status == AccountingVoucherStatus.Posted);
        var lines = voucher.Lines.ToList();
        lines.Sum(l => l.DebitAmount).ShouldBe(lines.Sum(l => l.CreditAmount), "every voucher balances");
        return lines;
    }

    private static CreateFixedAssetCommand Laptop(decimal amount = 113_000m, decimal vat = 13_000m, string method = "straight_line") =>
        new("Dell laptop", "Computers", Shrawan, amount, FixedAssetValues.Sources.CashBank, method, "B",
            VatAmount: vat, UsefulLifeMonths: 36, RatePercent: method == "written_down_value" ? 25m : null,
            PaymentMethod: "bank", SupplierVatNumber: vat > 0 ? "601111222" : null, BillNumber: vat > 0 ? "INV-77" : null);

    #region Acquisition

    [Fact]
    public async Task Paid_Now_With_Vat_Should_Debit_Cost_And_Input_Vat_And_Credit_The_Bank()
    {
        await SeedChartAsync();

        Guid id = await Create().Handle(Laptop(), CancellationToken.None);

        var asset = await _db.FixedAssets.SingleAsync(a => a.Id == id);
        asset.Cost.ShouldBe(100_000m);
        asset.VatAmount.ShouldBe(13_000m);

        var lines = await PostedLinesAsync(FixedAssetVouchers.ReferenceType, id);
        var fixedAssets = await AccountAsync(AccountingSystemAccountCodes.FixedAssets);
        fixedAssets.IsSystem.ShouldBeTrue("created on first use as a system account");
        lines.Single(l => l.AccountId == fixedAssets.Id).DebitAmount.ShouldBe(100_000m);
        lines.Single(l => l.AccountId == _inputVat.Id).DebitAmount.ShouldBe(13_000m);
        lines.Single(l => l.AccountId == _bank.Id).CreditAmount.ShouldBe(113_000m);

        var voucher = await _db.Vouchers.SingleAsync(v => v.ReferenceId == id);
        voucher.VoucherType.ShouldBe(FixedAssetVouchers.AcquisitionVoucherType);
        voucher.VoucherNo.ShouldStartWith("JV-");
    }

    [Fact]
    public async Task Supplier_Bill_Should_Credit_Accounts_Payable_And_Put_The_Bill_On_The_Suppliers_Ledger()
    {
        await SeedChartAsync();

        Guid id = await Create().Handle(
            Laptop() with { Source = FixedAssetValues.Sources.Supplier, PaymentMethod = null, SupplierId = _supplierId, SupplierVatNumber = null },
            CancellationToken.None);

        var lines = await PostedLinesAsync(FixedAssetVouchers.ReferenceType, id);
        lines.Single(l => l.AccountId == _payable.Id).CreditAmount.ShouldBe(113_000m);
        (await _db.FixedAssets.SingleAsync()).SupplierVatNumber.ShouldBe("601111222", "the supplier's VAT number on file is used");
        await _outbox.Received(1).AddAsync(
            Arg.Is<ExpenseBillRecordedIntegrationEvent>(e => e.ExpenseId == id && e.SupplierId == _supplierId && e.Amount == 113_000m),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Opening_Asset_Should_Bring_Cost_And_Depreciation_To_Date_Against_Equity()
    {
        await SeedChartAsync();

        Guid id = await Create().Handle(
            new CreateFixedAssetCommand(
                "Pharmacy fridge", "Equipment", new DateTime(2022, 7, 20, 0, 0, 0, DateTimeKind.Utc), 80_000m,
                FixedAssetValues.Sources.Opening, "straight_line", "D", UsefulLifeMonths: 60,
                OpeningAccumulatedDepreciation: 40_000m, DepreciationStartDateUtc: Shrawan),
            CancellationToken.None);

        var lines = await PostedLinesAsync(FixedAssetVouchers.ReferenceType, id);
        lines.Single(l => l.AccountId == (_db.Accounts.Single(a => a.Code == AccountingSystemAccountCodes.FixedAssets)).Id).DebitAmount.ShouldBe(80_000m);
        lines.Single(l => l.AccountId == (_db.Accounts.Single(a => a.Code == AccountingSystemAccountCodes.AccumulatedDepreciation)).Id).CreditAmount.ShouldBe(40_000m);
        lines.Single(l => l.AccountId == _equity.Id).CreditAmount.ShouldBe(40_000m);
        (await _db.Vouchers.SingleAsync(v => v.ReferenceId == id)).VoucherNo.ShouldStartWith("OB-");

        // Depreciation starts in the go-live month (Shrawan 2082): 40,000 left over the 24 months remaining of 60 (acquired Shrawan 2079).
        var asset = await _db.FixedAssets.SingleAsync();
        BookDepreciation.AmountFor(asset.Terms, new FiscalPeriod(2082, 1).Index).ShouldBe(1_666.67m);
    }

    #endregion

    #region Depreciation runs

    [Fact]
    public async Task Run_Should_Post_What_The_Preview_Shows_And_Balance()
    {
        await SeedChartAsync();
        Guid id = await Create().Handle(Laptop(), CancellationToken.None);

        var preview = await Preview().Handle(new GetDepreciationPreviewQuery(2082, 1), CancellationToken.None);
        preview.CanPost.ShouldBeTrue();
        preview.TotalAmount.ShouldBe(2_777.78m); // 100,000 ÷ 36
        preview.Lines.Single().AssetId.ShouldBe(id);

        var result = await Run().Handle(new RunDepreciationCommand(2082, 1), CancellationToken.None);

        result.TotalAmount.ShouldBe(preview.TotalAmount);
        result.VoucherIds.Count.ShouldBe(1);
        var lines = await PostedLinesAsync(DepreciationRun.ReferenceType, result.RunIds[0]);
        var expense = await AccountAsync(AccountingSystemAccountCodes.DepreciationExpense);
        var accumulated = await AccountAsync(AccountingSystemAccountCodes.AccumulatedDepreciation);
        lines.Single(l => l.AccountId == expense.Id).DebitAmount.ShouldBe(2_777.78m);
        lines.Single(l => l.AccountId == accumulated.Id).CreditAmount.ShouldBe(2_777.78m);

        var voucher = await _db.Vouchers.SingleAsync(v => v.Id == result.VoucherIds[0]);
        voucher.VoucherType.ShouldBe(DepreciationRun.VoucherType);
        NepalDate.FromUtc(voucher.VoucherDateUtc).ShouldBe(new DateOnly(2025, 8, 16), "dated the period's last day");
    }

    [Fact]
    public async Task Running_The_Same_Period_Twice_Should_Post_Nothing_The_Second_Time()
    {
        await SeedChartAsync();
        await Create().Handle(Laptop(), CancellationToken.None);

        await Run().Handle(new RunDepreciationCommand(2082, 1), CancellationToken.None);
        var again = await Run().Handle(new RunDepreciationCommand(2082, 1), CancellationToken.None);

        again.VoucherIds.ShouldBeEmpty();
        again.TotalAmount.ShouldBe(0m);
        (await _db.Vouchers.CountAsync(v => v.VoucherType == DepreciationRun.VoucherType)).ShouldBe(1);
        (await _db.FixedAssetDepreciationEntries.CountAsync()).ShouldBe(1);

        var preview = await Preview().Handle(new GetDepreciationPreviewQuery(2082, 1), CancellationToken.None);
        preview.CanPost.ShouldBeFalse();
        preview.AlreadyPostedMonths.ShouldBe(1);
    }

    [Fact]
    public async Task Whole_Year_After_A_Month_Should_Post_Only_The_Remaining_Eleven_Months()
    {
        await SeedChartAsync();
        await Create().Handle(Laptop(amount: 36_000m, vat: 0m), CancellationToken.None);

        await Run().Handle(new RunDepreciationCommand(2082, 1), CancellationToken.None);
        var year = await Run().Handle(new RunDepreciationCommand(2082), CancellationToken.None);

        year.AssetMonths.ShouldBe(11);
        year.TotalAmount.ShouldBe(11_000m);
        (await NetAsync(AccountingSystemAccountCodes.AccumulatedDepreciation)).ShouldBe(-12_000m);
        (await NetAsync(AccountingSystemAccountCodes.DepreciationExpense)).ShouldBe(12_000m);
    }

    [Fact]
    public async Task Period_That_Has_Not_Ended_Should_Be_Refused()
    {
        await SeedChartAsync();
        await Create().Handle(Laptop() with { AcquisitionDateUtc = new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc) }, CancellationToken.None);

        // Today is 13 Oct 2026 (Ashwin 2083 ends 17 Oct).
        var ex = await Should.ThrowAsync<CustomException>(async () =>
            await Run().Handle(new RunDepreciationCommand(2083, 3), CancellationToken.None));
        ex.Message.ShouldContain("ends on");
    }

    [Fact]
    public async Task Reversed_Run_Should_Unpost_Its_Months_So_The_Period_Can_Run_Again()
    {
        await SeedChartAsync();
        await Create().Handle(Laptop(), CancellationToken.None);
        var first = await Run().Handle(new RunDepreciationCommand(2082, 1), CancellationToken.None);

        await new ReverseDepreciationRunCommandHandler(_db, TestVoucherPosting.Create(_db), new AccountingPostingLockService(_db), _user, _branch)
            .Handle(new ReverseDepreciationRunCommand(first.RunIds[0]), CancellationToken.None);

        (await _db.FixedAssetDepreciationEntries.CountAsync()).ShouldBe(0);
        (await NetAsync(AccountingSystemAccountCodes.DepreciationExpense)).ShouldBe(0m);
        var again = await Run().Handle(new RunDepreciationCommand(2082, 1), CancellationToken.None);
        again.TotalAmount.ShouldBe(first.TotalAmount);
    }

    #endregion

    #region Disposal

    [Fact]
    public async Task Sale_Above_Book_Value_Should_Remove_Cost_And_Depreciation_And_Book_A_Gain()
    {
        await SeedChartAsync();
        Guid id = await Create().Handle(Laptop(amount: 36_000m, vat: 0m), CancellationToken.None);
        await Run().Handle(new RunDepreciationCommand(2082, 1), CancellationToken.None);
        await Run().Handle(new RunDepreciationCommand(2082, 2), CancellationToken.None);
        await Run().Handle(new RunDepreciationCommand(2082, 3), CancellationToken.None);

        // Book value after three months: 36,000 − 3,000 = 33,000; sold for 35,000 → gain 2,000.
        await Disposal().Handle(new DisposeFixedAssetCommand(id, Kartik, FixedAssetValues.DisposalKinds.Sale, 35_000m, "bank"), CancellationToken.None);

        var lines = await PostedLinesAsync(FixedAssetVouchers.DisposalReferenceType, id);
        lines.Single(l => l.AccountId == _bank.Id && l.DebitAmount > 0).DebitAmount.ShouldBe(35_000m);
        (await NetAsync(AccountingSystemAccountCodes.GainOnAssetDisposal)).ShouldBe(-2_000m);
        (await NetAsync(AccountingSystemAccountCodes.FixedAssets)).ShouldBe(0m);
        (await NetAsync(AccountingSystemAccountCodes.AccumulatedDepreciation)).ShouldBe(0m);

        var asset = await _db.FixedAssets.SingleAsync();
        asset.IsDisposed.ShouldBeTrue();
        asset.DisposalGainLoss.ShouldBe(2_000m);
    }

    [Fact]
    public async Task Write_Off_Should_Book_The_Whole_Book_Value_As_A_Loss()
    {
        await SeedChartAsync();
        Guid id = await Create().Handle(Laptop(amount: 36_000m, vat: 0m), CancellationToken.None);
        await Run().Handle(new RunDepreciationCommand(2082, 1), CancellationToken.None);

        // Written off in Bhadra: only Shrawan is charged.
        await Disposal().Handle(
            new DisposeFixedAssetCommand(id, new DateTime(2025, 8, 20, 0, 0, 0, DateTimeKind.Utc), FixedAssetValues.DisposalKinds.WriteOff),
            CancellationToken.None);

        await PostedLinesAsync(FixedAssetVouchers.DisposalReferenceType, id);
        (await NetAsync(AccountingSystemAccountCodes.LossOnAssetDisposal)).ShouldBe(35_000m);
        (await NetAsync(AccountingSystemAccountCodes.FixedAssets)).ShouldBe(0m);
        (await NetAsync(AccountingSystemAccountCodes.AccumulatedDepreciation)).ShouldBe(0m);

        // A disposed asset is not depreciated any further.
        var preview = await Preview().Handle(new GetDepreciationPreviewQuery(2082), CancellationToken.None);
        preview.Lines.ShouldBeEmpty();
    }

    [Fact]
    public async Task Disposal_Should_Wait_Until_Every_Earlier_Month_Is_Depreciated()
    {
        await SeedChartAsync();
        Guid id = await Create().Handle(Laptop(), CancellationToken.None);
        await Run().Handle(new RunDepreciationCommand(2082, 1), CancellationToken.None);

        var ex = await Should.ThrowAsync<CustomException>(async () =>
            await Disposal().Handle(new DisposeFixedAssetCommand(id, Kartik, FixedAssetValues.DisposalKinds.Sale, 50_000m, "cash"), CancellationToken.None));
        ex.Message.ShouldContain("Bhadra 2082");
        (await _db.FixedAssets.SingleAsync()).IsDisposed.ShouldBeFalse();
    }

    [Fact]
    public async Task Sale_With_Vat_Should_Credit_Vat_Payable_Keep_The_Gain_On_Net_Proceeds_And_Show_In_The_Vat_Return()
    {
        await SeedChartAsync();
        var vatPayable = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.VatPayable, AccountingAccountType.Liability, isSystem: true);
        Guid id = await Create().Handle(Laptop(amount: 36_000m, vat: 0m), CancellationToken.None);
        await Run().Handle(new RunDepreciationCommand(2082, 1), CancellationToken.None);
        await Run().Handle(new RunDepreciationCommand(2082, 2), CancellationToken.None);
        await Run().Handle(new RunDepreciationCommand(2082, 3), CancellationToken.None);

        // Book value 33,000; sold for 35,000 + 13% VAT 4,550 = 39,550 received → gain 2,000 on the net proceeds.
        await Disposal().Handle(
            new DisposeFixedAssetCommand(id, Kartik, FixedAssetValues.DisposalKinds.Sale, 35_000m, "bank", VatAmount: 4_550m),
            CancellationToken.None);

        var lines = await PostedLinesAsync(FixedAssetVouchers.DisposalReferenceType, id);
        lines.Single(l => l.AccountId == _bank.Id && l.DebitAmount > 0).DebitAmount.ShouldBe(39_550m);
        lines.Single(l => l.AccountId == vatPayable.Id).CreditAmount.ShouldBe(4_550m);
        (await NetAsync(AccountingSystemAccountCodes.GainOnAssetDisposal)).ShouldBe(-2_000m);
        (await NetAsync(AccountingSystemAccountCodes.FixedAssets)).ShouldBe(0m);

        var asset = await _db.FixedAssets.SingleAsync();
        asset.DisposalVatAmount.ShouldBe(4_550m);
        asset.DisposalGainLoss.ShouldBe(2_000m);

        var report = await new GetVatReturnQueryHandler(_db, _branch, VatReturnTestMediator.Empty())
            .Handle(new GetVatReturnQuery(Kartik.AddDays(-2), Kartik.AddDays(2)), CancellationToken.None);

        var sales = report.Sales.ShouldNotBeNull();
        sales.FixedAssetSales.ShouldBe(35_000m);
        sales.FixedAssetSalesVat.ShouldBe(4_550m);
        sales.FixedAssetSaleCount.ShouldBe(1);
        sales.TaxableSales.ShouldBe(35_000m, "an asset sale with VAT is a taxable supply");
        sales.NetOutputVat.ShouldBe(4_550m);
        sales.InvoiceCount.ShouldBe(1);
        report.NetVatPayable.ShouldBe(4_550m, "the ledger's output VAT includes the disposal voucher's credit to 2100");
        var reconciliation = report.Reconciliation.ShouldNotBeNull();
        reconciliation.OutputVatDifference.ShouldBe(0m);
    }

    [Fact]
    public async Task Sale_Without_Vat_Should_Post_No_Vat_Line_And_Stay_Out_Of_The_Vat_Return()
    {
        await SeedChartAsync();
        Guid id = await Create().Handle(Laptop(amount: 36_000m, vat: 0m), CancellationToken.None);
        await Run().Handle(new RunDepreciationCommand(2082, 1), CancellationToken.None);
        await Run().Handle(new RunDepreciationCommand(2082, 2), CancellationToken.None);
        await Run().Handle(new RunDepreciationCommand(2082, 3), CancellationToken.None);

        await Disposal().Handle(new DisposeFixedAssetCommand(id, Kartik, FixedAssetValues.DisposalKinds.Sale, 35_000m, "bank"), CancellationToken.None);

        (await _db.Accounts.AnyAsync(a => a.Code == AccountingSystemAccountCodes.VatPayable)).ShouldBeFalse("no VAT line, so 2100 is never touched");
        (await _db.FixedAssets.SingleAsync()).DisposalVatAmount.ShouldBe(0m);
    }

    [Fact]
    public void Disposal_Validator_Should_Keep_Vat_To_Sales_And_Below_The_Proceeds()
    {
        var validator = new DisposeFixedAssetCommandValidator();
        Guid id = Guid.CreateVersion7();

        validator.Validate(new DisposeFixedAssetCommand(id, Kartik, FixedAssetValues.DisposalKinds.Sale, 35_000m, "bank", VatAmount: 4_550m))
            .IsValid.ShouldBeTrue();
        validator.Validate(new DisposeFixedAssetCommand(id, Kartik, FixedAssetValues.DisposalKinds.Sale, 35_000m, "bank", VatAmount: -1m))
            .IsValid.ShouldBeFalse();
        validator.Validate(new DisposeFixedAssetCommand(id, Kartik, FixedAssetValues.DisposalKinds.Sale, 1_000m, "bank", VatAmount: 1_000m))
            .IsValid.ShouldBeFalse();
        validator.Validate(new DisposeFixedAssetCommand(id, Kartik, FixedAssetValues.DisposalKinds.WriteOff, VatAmount: 130m))
            .IsValid.ShouldBeFalse();
    }

    #endregion

    #region Edit, delete and reports

    [Fact]
    public async Task Depreciation_Terms_Should_Be_Locked_Once_Depreciation_Is_Posted_And_Delete_Refused()
    {
        await SeedChartAsync();
        Guid id = await Create().Handle(Laptop(), CancellationToken.None);
        await Run().Handle(new RunDepreciationCommand(2082, 1), CancellationToken.None);

        var update = new UpdateFixedAssetCommandHandler(_db, _branch);
        await update.Handle(new UpdateFixedAssetCommand(id, "Dell Latitude", "Computers", "straight_line", "B", UsefulLifeMonths: 36), CancellationToken.None);
        (await _db.FixedAssets.SingleAsync()).Name.ShouldBe("Dell Latitude");

        await Should.ThrowAsync<CustomException>(async () =>
            await update.Handle(new UpdateFixedAssetCommand(id, "Dell Latitude", "Computers", "straight_line", "B", UsefulLifeMonths: 48), CancellationToken.None));
        await Should.ThrowAsync<CustomException>(async () =>
            await new DeleteFixedAssetCommandHandler(_db, TestVoucherPosting.Create(_db), _user, _branch, _mediator, _outbox)
                .Handle(new DeleteFixedAssetCommand(id), CancellationToken.None));
    }

    [Fact]
    public async Task Delete_Should_Reverse_The_Acquisition()
    {
        await SeedChartAsync();
        Guid id = await Create().Handle(Laptop(), CancellationToken.None);

        await new DeleteFixedAssetCommandHandler(_db, TestVoucherPosting.Create(_db), _user, _branch, _mediator, _outbox)
            .Handle(new DeleteFixedAssetCommand(id), CancellationToken.None);

        (await _db.FixedAssets.AnyAsync()).ShouldBeFalse();
        (await NetAsync(AccountingSystemAccountCodes.FixedAssets)).ShouldBe(0m);
        (await NetAsync(AccountingSystemAccountCodes.Bank)).ShouldBe(0m);
    }

    [Fact]
    public async Task Schedules_Should_Show_The_Year_Book_And_Tax_Depreciation()
    {
        await SeedChartAsync();
        await Create().Handle(Laptop(), CancellationToken.None);
        await Run().Handle(new RunDepreciationCommand(2082, 1), CancellationToken.None);

        var schedule = await new GetDepreciationScheduleQueryHandler(_db, _branch).Handle(new GetDepreciationScheduleQuery(2082), CancellationToken.None);
        var row = schedule.Rows.Single();
        row.Additions.ShouldBe(100_000m);
        row.DepreciationForYear.ShouldBe(33_333.33m); // 12 of 36 months
        row.DepreciationPosted.ShouldBe(2_777.78m);
        row.PostedMonths.Count(p => p).ShouldBe(1);
        row.ClosingNetBookValue.ShouldBe(66_666.67m);

        var tax = await new GetTaxDepreciationScheduleQueryHandler(_db).Handle(new GetTaxDepreciationScheduleQuery(2082), CancellationToken.None);
        var poolB = tax.Pools.Single(p => p.Pool == "B");
        poolB.AdditionsFull.ShouldBe(100_000m, "bought in Shrawan: in full");
        poolB.Depreciation.ShouldBe(25_000m);
        tax.Note.ShouldContain("confirm");
    }

    #endregion

    private sealed class FixedClock(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
