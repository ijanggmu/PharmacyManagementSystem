using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using FSH.Modules.Accounting.Contracts.v1.Vat;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.Reports.GetVatReturn;
using FSH.Modules.Accounting.Features.v1.Vat;
using FSH.Modules.Accounting.Features.v1.Vat.RecordVatPayment;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.v1.Reports;
using FSH.Modules.Sales.Contracts.v1.Ird;
using Mediator;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Accounting.Tests.Features.Reports;

/// <summary>IRD-layout VAT return (register turnover, carry-forward, reconciliation) and the VAT payment cap.</summary>
public sealed class VatReturnIrdLayoutTests : IDisposable
{
    private static readonly DateTime From = new(2026, 9, 16, 18, 15, 0, DateTimeKind.Utc); // 1 Ashwin 2083 00:00 NPT
    private static readonly DateTime To = new(2026, 10, 17, 18, 14, 59, DateTimeKind.Utc);

    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private int _no;

    private AccountingAccount _cash = null!;
    private AccountingAccount _bank = null!;
    private AccountingAccount _vat = null!;
    private AccountingAccount _inputVat = null!;
    private AccountingAccount _revenue = null!;
    private AccountingAccount _returns = null!;
    private AccountingAccount _inventory = null!;
    private AccountingAccount _ap = null!;

    public VatReturnIrdLayoutTests()
    {
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>())
            .Returns(ci => ci.ArgAt<Guid?>(0));
    }

    public void Dispose() => _db.Dispose();

    private async Task ChartAsync()
    {
        _cash = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.Cash, AccountingAccountType.Asset, isSystem: true);
        _bank = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.Bank, AccountingAccountType.Asset, isSystem: true);
        _vat = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.VatPayable, AccountingAccountType.Liability, isSystem: true);
        _inputVat = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.InputVatRecoverable, AccountingAccountType.Asset, isSystem: true);
        _revenue = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.SalesRevenue, AccountingAccountType.Revenue, isSystem: true);
        _returns = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.SalesReturnsAndAllowances, AccountingAccountType.Revenue, isSystem: true);
        _inventory = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.Inventory, AccountingAccountType.Asset, isSystem: true);
        _ap = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.AccountsPayable, AccountingAccountType.Liability, isSystem: true);
    }

    private async Task PostAsync(DateTime dateUtc, string voucherType, params (Guid Account, decimal Debit, decimal Credit)[] lines)
    {
        var voucher = AccountingVoucher.CreateDraft(dateUtc, voucherType, AccountingVoucherSource.System, voucherType);
        foreach (var (account, debit, credit) in lines)
        {
            voucher.AddLine(account, null, debit, credit);
        }

        voucher.Post($"SV-{++_no:D3}", "tester");
        _db.Vouchers.Add(voucher);
        await _db.SaveChangesAsync();
    }

    private Task SaleAsync(DateTime day, decimal taxable, decimal exempt, decimal vat) =>
        PostAsync(day, "system_sale", (_cash.Id, taxable + exempt + vat, 0m), (_revenue.Id, 0m, taxable + exempt), (_vat.Id, 0m, vat));

    private Task PurchaseAsync(DateTime day, decimal net, decimal vat) =>
        PostAsync(day, "system_purchase", (_inventory.Id, net, 0m), (_inputVat.Id, vat, 0m), (_ap.Id, 0m, net + vat));

    private Task<FSH.Modules.Accounting.Contracts.Dtos.VatReturnReportDto> ReturnAsync(IMediator mediator) =>
        new GetVatReturnQueryHandler(_db, _currentBranch, mediator).Handle(new GetVatReturnQuery(From, To), CancellationToken.None).AsTask();

    #region IRD layout

    [Fact]
    public async Task VatReturn_Should_Report_Register_Turnover_Split_And_Net_Of_Returns_And_Debit_Notes()
    {
        await ChartAsync();
        var day = From.AddDays(3);
        await SaleAsync(day, taxable: 1000m, exempt: 400m, vat: 130m);
        await PostAsync(day, "system_sales_return", (_returns.Id, 100m, 0m), (_vat.Id, 13m, 0m), (_cash.Id, 0m, 113m));
        await PurchaseAsync(day, net: 600m, vat: 52m);
        await PostAsync(day, "system_supplier_return", (_ap.Id, 113m, 0m), (_inventory.Id, 0m, 100m), (_inputVat.Id, 0m, 13m));

        var mediator = VatReturnTestMediator.With(
            VatReturnTestMediator.Sales(taxable: 1000m, exempt: 400m, vat: 130m, returnsTaxable: 100m, returnsVat: 13m),
            VatReturnTestMediator.Purchases(taxable: 400m, exempt: 200m, vat: 52m, debitTaxable: 100m, debitVat: 13m));

        var result = await ReturnAsync(mediator);

        var sales = result.Sales.ShouldNotBeNull();
        sales.TaxableSales.ShouldBe(1000m);
        sales.ExemptSales.ShouldBe(400m);
        sales.ExportSales.ShouldBe(0m);
        sales.NetTaxableSales.ShouldBe(900m);
        sales.NetExemptSales.ShouldBe(400m);
        sales.NetOutputVat.ShouldBe(117m);
        sales.NetTotalSales.ShouldBe(1300m);

        var purchases = result.Purchases.ShouldNotBeNull();
        purchases.NetTaxablePurchases.ShouldBe(300m);
        purchases.NetExemptPurchases.ShouldBe(200m);
        purchases.NetInputVat.ShouldBe(39m);
        purchases.NetTotalPurchases.ShouldBe(500m);

        // VAT amounts stay ledger-based: 130 − 13 output, 52 − 13 input.
        result.NetVatPayable.ShouldBe(117m);
        result.InputVat.ShouldBe(39m);
        result.NetVatDue.ShouldBe(78m);

        var rec = result.Reconciliation.ShouldNotBeNull();
        rec.HasDifference.ShouldBeFalse();
        rec.OutputVatDifference.ShouldBe(0m);
        rec.InputVatDifference.ShouldBe(0m);
    }

    [Fact]
    public async Task VatReturn_Should_Count_Expense_Vat_Bills_As_Taxable_Purchases()
    {
        await ChartAsync();
        var rent = await AccountingTestChart.AddAsync(_db, "5200", AccountingAccountType.Expense);
        var day = From.AddDays(4);
        // Rent of 1,000 + 130 VAT on a VAT bill, paid in cash: posted Dr Rent / Dr Input VAT / Cr Cash.
        _db.Expenses.Add(Expense.Create(
            day, "Rent", 1130m, "cash", null, "tester", receiptReference: "R-1", expenseAccountId: rent.Id,
            vatAmount: 130m, supplierVatNumber: "301234567"));
        await _db.SaveChangesAsync();
        await PostAsync(day, "system_expense", (rent.Id, 1000m, 0m), (_inputVat.Id, 130m, 0m), (_cash.Id, 0m, 1130m));

        var result = await ReturnAsync(VatReturnTestMediator.With(null, null));

        var purchases = result.Purchases.ShouldNotBeNull();
        purchases.TaxablePurchases.ShouldBe(1000m);
        purchases.NetInputVat.ShouldBe(130m);
        purchases.BillCount.ShouldBe(1);
        result.Reconciliation.ShouldNotBeNull().HasDifference.ShouldBeFalse();
    }

    [Fact]
    public async Task VatReturn_Should_Flag_Difference_When_Register_And_Ledger_Vat_Disagree()
    {
        await ChartAsync();
        await SaleAsync(From.AddDays(1), taxable: 1000m, exempt: 0m, vat: 130m);
        // A manual journal on the VAT account that no sales document backs.
        await PostAsync(From.AddDays(2), "journal", (_revenue.Id, 100m, 0m), (_vat.Id, 0m, 100m));

        var result = await ReturnAsync(VatReturnTestMediator.With(VatReturnTestMediator.Sales(taxable: 1000m, vat: 130m), null));

        var rec = result.Reconciliation.ShouldNotBeNull();
        rec.HasDifference.ShouldBeTrue();
        rec.RegisterOutputVat.ShouldBe(130m);
        rec.LedgerOutputVat.ShouldBe(230m);
        rec.OutputVatDifference.ShouldBe(-100m);
        rec.InputVatDifference.ShouldBe(0m);
    }

    [Fact]
    public async Task VatReturn_Should_Pass_Period_And_Resolved_Branch_To_Register_Queries()
    {
        await ChartAsync();
        var branchId = Guid.CreateVersion7();
        var mediator = VatReturnTestMediator.Empty();
        using var cts = new CancellationTokenSource();

        await new GetVatReturnQueryHandler(_db, _currentBranch, mediator).Handle(new GetVatReturnQuery(From, To, branchId), cts.Token);

        await mediator.Received(1).Send(
            Arg.Is<GetSalesVatSummaryQuery>(q => q.PeriodStartUtc == From && q.PeriodEndUtc == To && q.BranchId == branchId), cts.Token);
        await mediator.Received(1).Send(
            Arg.Is<GetPurchaseVatSummaryQuery>(q => q.PeriodStartUtc == From && q.PeriodEndUtc == To && q.BranchId == branchId), cts.Token);
    }

    #endregion

    #region Carry-forward

    [Fact]
    public async Task VatReturn_Should_Bring_Forward_Prior_Credit_And_Set_It_Against_This_Period()
    {
        await ChartAsync();
        // Last month: input VAT 200 exceeds output VAT 130 → 70 credit.
        await SaleAsync(From.AddDays(-10), taxable: 1000m, exempt: 0m, vat: 130m);
        await PurchaseAsync(From.AddDays(-9), net: 1538.46m, vat: 200m);
        // This month: output 130, input 26 → net 104; 70 credit absorbs part of it.
        await SaleAsync(From.AddDays(2), taxable: 1000m, exempt: 0m, vat: 130m);
        await PurchaseAsync(From.AddDays(3), net: 200m, vat: 26m);

        var result = await ReturnAsync(VatReturnTestMediator.Empty());

        var cf = result.CarryForward.ShouldNotBeNull();
        cf.OpeningPosition.ShouldBe(-70m);
        cf.CreditBroughtForward.ShouldBe(70m);
        cf.UnpaidVatBroughtForward.ShouldBe(0m);
        cf.NetVatForPeriod.ShouldBe(104m);
        cf.VatPayable.ShouldBe(34m);
        cf.CreditCarriedForward.ShouldBe(0m);
        cf.ClosingPosition.ShouldBe(34m);
    }

    [Fact]
    public async Task VatReturn_Should_Carry_Forward_Unused_Credit_And_Net_Payments_Out_Of_The_Opening()
    {
        await ChartAsync();
        // Two months ago: 130 payable, paid in full last month → no arrears.
        await SaleAsync(From.AddDays(-40), taxable: 1000m, exempt: 0m, vat: 130m);
        await PostAsync(From.AddDays(-20), VatSettlement.VoucherType, (_vat.Id, 130m, 0m), (_bank.Id, 0m, 130m));
        // Last month: 50 credit.
        await PurchaseAsync(From.AddDays(-5), net: 384.62m, vat: 50m);
        // This month: another 20 credit, and an input/output set-off journal (moves nothing).
        await PurchaseAsync(From.AddDays(4), net: 153.85m, vat: 20m);
        await PostAsync(From.AddDays(5), "journal", (_vat.Id, 10m, 0m), (_inputVat.Id, 0m, 10m));

        var result = await ReturnAsync(VatReturnTestMediator.Empty());

        var cf = result.CarryForward.ShouldNotBeNull();
        cf.OpeningPosition.ShouldBe(-50m);
        cf.CreditBroughtForward.ShouldBe(50m);
        cf.NetVatForPeriod.ShouldBe(-20m);
        cf.VatPayable.ShouldBe(0m);
        cf.CreditCarriedForward.ShouldBe(70m);
        cf.VatPaidInPeriod.ShouldBe(0m);
        cf.ClosingPosition.ShouldBe(-70m);
    }

    [Fact]
    public async Task VatReturn_Should_Show_Unpaid_Prior_Vat_And_Payments_Made_In_The_Period()
    {
        await ChartAsync();
        await SaleAsync(From.AddDays(-10), taxable: 1000m, exempt: 0m, vat: 130m);
        // This month: last month's VAT paid in part, and new output VAT.
        await PostAsync(From.AddDays(10), VatSettlement.VoucherType, (_vat.Id, 100m, 0m), (_bank.Id, 0m, 100m));
        await SaleAsync(From.AddDays(11), taxable: 500m, exempt: 0m, vat: 65m);

        var result = await ReturnAsync(VatReturnTestMediator.Empty());

        var cf = result.CarryForward.ShouldNotBeNull();
        cf.UnpaidVatBroughtForward.ShouldBe(130m);
        cf.CreditBroughtForward.ShouldBe(0m);
        cf.VatPayable.ShouldBe(65m);
        cf.VatPaidInPeriod.ShouldBe(100m);
        cf.ClosingPosition.ShouldBe(95m);
    }

    #endregion

    #region VAT payment cap

    private RecordVatPaymentCommandHandler PaymentHandler() => new(
        TestVoucherPosting.Create(_db, _currentBranch),
        new AccountingAccountResolver(_db),
        TestPaymentAccounts.For(new AccountingAccountResolver(_db), _db),
        _currentBranch,
        new AccountingPostingLockService(_db),
        _db);

    [Fact]
    public async Task RecordVatPayment_Should_Allow_Partial_And_Full_Payment_Of_The_Vat_Payable()
    {
        await ChartAsync();
        await SaleAsync(From.AddDays(1), taxable: 1000m, exempt: 0m, vat: 130m);
        await PurchaseAsync(From.AddDays(2), net: 230.77m, vat: 30m);
        var handler = PaymentHandler();

        await handler.Handle(new RecordVatPaymentCommand(From.AddDays(5), 60m, "bank"), CancellationToken.None);
        await handler.Handle(new RecordVatPaymentCommand(From.AddDays(6), 40m, "bank"), CancellationToken.None);

        (await _db.Vouchers.CountAsync(v => v.VoucherType == VatSettlement.VoucherType)).ShouldBe(2);
        // Fully paid now: nothing more can be paid.
        await Should.ThrowAsync<CustomException>(() =>
            handler.Handle(new RecordVatPaymentCommand(From.AddDays(7), 0.01m, "bank"), CancellationToken.None).AsTask());
    }

    [Fact]
    public async Task RecordVatPayment_Should_Refuse_More_Than_The_Vat_Payable_As_Of_The_Payment_Date()
    {
        await ChartAsync();
        await SaleAsync(From.AddDays(1), taxable: 1000m, exempt: 0m, vat: 130m);
        await PurchaseAsync(From.AddDays(2), net: 230.77m, vat: 30m);
        // Output VAT after the payment date doesn't count towards what can be paid on it.
        await SaleAsync(From.AddDays(20), taxable: 1000m, exempt: 0m, vat: 130m);

        var ex = await Should.ThrowAsync<CustomException>(() =>
            PaymentHandler().Handle(new RecordVatPaymentCommand(From.AddDays(5), 100.01m, "bank"), CancellationToken.None).AsTask());

        ex.Message.ShouldContain("100.00");
        (await _db.Vouchers.CountAsync(v => v.VoucherType == VatSettlement.VoucherType)).ShouldBe(0);
    }

    [Fact]
    public async Task RecordVatPayment_Should_Refuse_Any_Payment_When_There_Is_An_Input_Vat_Credit()
    {
        await ChartAsync();
        await PurchaseAsync(From.AddDays(2), net: 384.62m, vat: 50m);

        var ex = await Should.ThrowAsync<CustomException>(() =>
            PaymentHandler().Handle(new RecordVatPaymentCommand(From.AddDays(5), 10m, "cash"), CancellationToken.None).AsTask());

        ex.Message.ShouldContain("No VAT is payable");
        ex.Message.ShouldContain("50.00");
    }

    #endregion
}
