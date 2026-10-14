using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.Events;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Expenses;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using FSH.Modules.Accounting.Contracts.v1.Tds;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.Expenses.DeleteExpense;
using FSH.Modules.Accounting.Features.v1.Expenses.RecordExpense;
using FSH.Modules.Accounting.Features.v1.Expenses.UpdateExpense;
using FSH.Modules.Accounting.Features.v1.Reports.GetTdsReport;
using FSH.Modules.Accounting.Features.v1.Tds;
using FSH.Modules.Accounting.Features.v1.Tds.GetTdsCategories;
using FSH.Modules.Accounting.Features.v1.Tds.RecordTdsPayment;
using FSH.Modules.Accounting.Features.v1.Tds.UpdateTdsCategories;
using FSH.Modules.Accounting.IntegrationEventHandlers;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Contracts.Events;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using Mediator;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Accounting.Tests.Features.Tds;

/// <summary>
/// TDS (tax deducted at source) end to end against a real voucher posting service and chart: expenses paid now and
/// pay later, supplier payments (and their void), the TDS deposit with its cap, the deduction rows behind the TDS
/// report and the report totals. Every voucher must balance.
/// </summary>
public sealed class TdsPostingTests : IDisposable
{
    private static readonly DateTime Day = new(2026, 6, 10, 0, 0, 0, DateTimeKind.Utc);

    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();
    private readonly ICurrentUser _user = Substitute.For<ICurrentUser>();
    private readonly ICurrentBranch _branch = Substitute.For<ICurrentBranch>();
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly Guid _supplierId = Guid.CreateVersion7();

    private AccountingAccount _general = default!;
    private AccountingAccount _cash = default!;
    private AccountingAccount _bank = default!;
    private AccountingAccount _payable = default!;

    public TdsPostingTests()
    {
        _user.Name.Returns("manager1");
        _branch.CanViewAllBranchesAsync(Arg.Any<CancellationToken>()).Returns(true);
        _mediator.Send(Arg.Is<GetSupplierByIdQuery>(q => q.SupplierId == _supplierId), Arg.Any<CancellationToken>())
            .Returns(new SupplierDto(_supplierId, "Himal Landlord", null, null, null, null, "301234567", 0m, true, DateTime.UtcNow, null));
        _mediator.Send(Arg.Any<GetSupplierOpenBillsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new SupplierOpenBillsDto(_supplierId, 0m, 0m, []));
    }

    public void Dispose() => _db.Dispose();

    private async Task SeedChartAsync()
    {
        _general = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.GeneralExpenses, AccountingAccountType.Expense, isSystem: true);
        _cash = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.Cash, AccountingAccountType.Asset, isSystem: true);
        _bank = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.Bank, AccountingAccountType.Asset, isSystem: true);
        await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.InputVatRecoverable, AccountingAccountType.Asset, isSystem: true);
        _payable = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.AccountsPayable, AccountingAccountType.Liability, isSystem: true);
        await CashFloatAsync();
    }

    /// <summary>Cash already in the drawer, so cash-paid expenses have money to come out of (cash can't go below zero).</summary>
    private const decimal CashFloat = 100_000m;

    private async Task CashFloatAsync()
    {
        var capital = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.OwnersEquity, AccountingAccountType.Equity, isSystem: true);
        await VoucherSeed.PostedAsync(_db, new DateTime(2026, 1, 1, 6, 0, 0, DateTimeKind.Utc), "OB-FLOAT", _cash.Id, capital.Id, CashFloat, "opening_balance");
    }

    private AccountingAccountResolver Resolver => new(_db);

    private RecordExpenseCommandHandler Record() =>
        new(_db, TestVoucherPosting.Create(_db), Resolver, TestPaymentAccounts.For(Resolver, _db), _user, _branch,
            new AccountingPostingLockService(_db), _mediator, _outbox);

    private UpdateExpenseCommandHandler Update() =>
        new(_db, TestVoucherPosting.Create(_db), Resolver, TestPaymentAccounts.For(Resolver, _db), _user, _branch,
            new AccountingPostingLockService(_db), _mediator);

    private DeleteExpenseCommandHandler Delete() => new(_db, TestVoucherPosting.Create(_db), _user, _branch, _mediator, _outbox);

    private SupplierPaymentRecordedIntegrationEventHandler SupplierPaid() =>
        new(TestVoucherPosting.Create(_db), Resolver, TestPaymentAccounts.For(Resolver, _db), _db);

    private RecordTdsPaymentCommandHandler TdsPayment() =>
        new(TestVoucherPosting.Create(_db), TestPaymentAccounts.For(Resolver, _db), _branch, new AccountingPostingLockService(_db), _db);

    private GetTdsReportQueryHandler Report() => new(_db, _branch);

    private Task<AccountingAccount> TdsAccountAsync() =>
        _db.Accounts.SingleAsync(a => a.Code == AccountingSystemAccountCodes.TdsPayable);

    private async Task<decimal> NetAsync(Guid accountId) =>
        (await _db.VoucherLines.Where(l => l.AccountId == accountId).ToListAsync()).Sum(l => l.DebitAmount - l.CreditAmount);

    private async Task<List<AccountingVoucherLine>> PostedLinesAsync(string referenceType, Guid referenceId)
    {
        var voucher = await _db.Vouchers.Include(v => v.Lines)
            .SingleAsync(v => v.ReferenceType == referenceType && v.ReferenceId == referenceId && v.Status == AccountingVoucherStatus.Posted);
        var lines = voucher.Lines.ToList();
        lines.Sum(l => l.DebitAmount).ShouldBe(lines.Sum(l => l.CreditAmount), "every voucher balances");
        return lines;
    }

    private SupplierPaymentRecordedIntegrationEvent SupplierPayment(Guid entryId, decimal amount, decimal tds, string? category = "service_vat") =>
        new(Guid.NewGuid(), Day, "t", "c", "Suppliers", entryId, _supplierId, "Lekhapal Consulting", amount, "bill INV-9",
            PaymentMethod: "bank", PaymentDateUtc: Day, TdsAmount: tds, TdsCategory: category, TdsRatePercent: 1.5m,
            TdsTaxableAmount: amount, SupplierPan: "601234567", DocumentReference: "INV-9");

    #region Expenses

    [Fact]
    public async Task PaidNow_Expense_Should_Credit_Cash_Net_And_TdsPayable_On_The_Amount_Excluding_Vat()
    {
        await SeedChartAsync();

        // 1,130 VAT bill (130 VAT): TDS 1.5% of 1,000 = 15; cash paid 1,115.
        var id = await Record().Handle(new RecordExpenseCommand(
            Day, "Audit fee", 1130m, "cash", ReceiptReference: "B-1", VatAmount: 130m, SupplierVatNumber: "601234567",
            VendorName: "Lekhapal", TdsCategory: "service_vat"), CancellationToken.None);

        var tdsAccount = await TdsAccountAsync();
        tdsAccount.IsSystem.ShouldBeTrue("created on first use");
        tdsAccount.AccountType.ShouldBe(AccountingAccountType.Liability);

        var lines = await PostedLinesAsync("Expense", id);
        lines.Single(l => l.AccountId == _general.Id).DebitAmount.ShouldBe(1000m);
        lines.Single(l => l.AccountId == _cash.Id).CreditAmount.ShouldBe(1115m);
        lines.Single(l => l.AccountId == tdsAccount.Id).CreditAmount.ShouldBe(15m);

        var expense = await _db.Expenses.SingleAsync();
        expense.TdsAmount.ShouldBe(15m);
        expense.TdsRatePercent.ShouldBe(1.5m);
        expense.PayableAmount.ShouldBe(1115m);

        var deduction = await _db.TdsDeductions.SingleAsync();
        deduction.SourceType.ShouldBe(TdsDeduction.SourceTypes.Expense);
        deduction.SourceId.ShouldBe(id);
        deduction.TaxableAmount.ShouldBe(1000m);
        deduction.TdsAmount.ShouldBe(15m);
        deduction.Pan.ShouldBe("601234567");
        deduction.DocumentReference.ShouldBe("B-1");
    }

    [Fact]
    public async Task PayLater_Expense_Should_Owe_The_Supplier_Gross_Less_Tds()
    {
        await SeedChartAsync();

        // Rent 10,000 to a landlord, 10% TDS: 9,000 owed on the supplier's ledger, 1,000 to IRD.
        var id = await Record().Handle(new RecordExpenseCommand(
            Day, "Shop rent", 10000m, "", SupplierId: _supplierId, TdsCategory: "rent"), CancellationToken.None);

        var lines = await PostedLinesAsync("Expense", id);
        lines.Single(l => l.AccountId == _payable.Id).CreditAmount.ShouldBe(9000m);
        var tdsAccountId = (await TdsAccountAsync()).Id;
        lines.Single(l => l.AccountId == tdsAccountId).CreditAmount.ShouldBe(1000m);

        await _outbox.Received(1).AddAsync(
            Arg.Is<ExpenseBillRecordedIntegrationEvent>(e => e.Amount == 9000m && e.TdsAmount == 1000m && e.ExpenseId == id),
            Arg.Any<CancellationToken>());
        (await _db.TdsDeductions.SingleAsync()).Pan.ShouldBe("301234567", "the supplier's PAN on file");
    }

    [Fact]
    public async Task PayLater_Expense_Tds_Should_Not_Be_Editable()
    {
        await SeedChartAsync();
        var id = await Record().Handle(new RecordExpenseCommand(
            Day, "Shop rent", 10000m, "", SupplierId: _supplierId, TdsCategory: "rent"), CancellationToken.None);

        var ex = await Should.ThrowAsync<CustomException>(() => Update().Handle(new UpdateExpenseCommand(
            id, "Shop rent", 10000m, "", SupplierId: _supplierId, TdsCategory: "rent", TdsRatePercent: 5m), CancellationToken.None).AsTask());
        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Editing_A_PaidNow_Expense_Should_Replace_Its_Tds_And_Deduction()
    {
        await SeedChartAsync();
        var id = await Record().Handle(new RecordExpenseCommand(
            Day, "Consultancy", 2000m, "cash", VendorName: "Lekhapal", SupplierVatNumber: "601234567", TdsCategory: "service_non_vat"), CancellationToken.None);
        (await NetAsync((await TdsAccountAsync()).Id)).ShouldBe(-300m);

        await Update().Handle(new UpdateExpenseCommand(
            id, "Consultancy", 2000m, "cash", VendorName: "Lekhapal", SupplierVatNumber: "601234567", TdsCategory: "service_vat"), CancellationToken.None);

        var tdsId = (await TdsAccountAsync()).Id;
        (await NetAsync(tdsId)).ShouldBe(-30m, "the old 15% voucher is reversed, the new 1.5% one posted");
        (await NetAsync(_cash.Id)).ShouldBe(CashFloat - 1970m);
        var deduction = await _db.TdsDeductions.SingleAsync();
        deduction.CategoryCode.ShouldBe("service_vat");
        deduction.TdsAmount.ShouldBe(30m);

        // Removing the TDS removes the deduction.
        await Update().Handle(new UpdateExpenseCommand(id, "Consultancy", 2000m, "cash"), CancellationToken.None);
        (await NetAsync(tdsId)).ShouldBe(0m);
        (await _db.TdsDeductions.CountAsync()).ShouldBe(0);
    }

    [Fact]
    public async Task Deleting_An_Expense_Should_Remove_Its_Deduction_And_Reverse_The_Tds()
    {
        await SeedChartAsync();
        var id = await Record().Handle(new RecordExpenseCommand(Day, "Commission", 1000m, "cash", VendorName: "Lekhapal", SupplierVatNumber: "601234567", TdsCategory: "commission"), CancellationToken.None);

        await Delete().Handle(new DeleteExpenseCommand(id), CancellationToken.None);

        (await NetAsync((await TdsAccountAsync()).Id)).ShouldBe(0m);
        (await _db.TdsDeductions.CountAsync()).ShouldBe(0);
    }

    [Fact]
    public async Task Expense_Should_Use_An_Explicit_Tds_Amount_And_Refuse_An_Unknown_Category()
    {
        await SeedChartAsync();
        var id = await Record().Handle(new RecordExpenseCommand(
            Day, "Contract", 1000m, "cash", VendorName: "Lekhapal", SupplierVatNumber: "601234567", TdsCategory: "CONTRACT", TdsAmount: 15.01m), CancellationToken.None);
        (await _db.Expenses.SingleAsync(e => e.Id == id)).TdsAmount.ShouldBe(15.01m, "within a paisa of 1.5% of 1,000");

        // An amount that disagrees with the category's rate is refused: 1 instead of 15% of 10,000.
        var wrong = await Should.ThrowAsync<CustomException>(() => Record().Handle(new RecordExpenseCommand(
            Day, "Consultancy", 10_000m, "cash", VendorName: "Lekhapal", SupplierVatNumber: "601234567",
            TdsCategory: "service_non_vat", TdsAmount: 1m), CancellationToken.None).AsTask());
        wrong.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        wrong.Message.ShouldContain("1,500.00");

        var ex = await Should.ThrowAsync<CustomException>(() => Record().Handle(new RecordExpenseCommand(
            Day, "x", 1000m, "cash", VendorName: "Lekhapal", SupplierVatNumber: "601234567", TdsCategory: "nope"), CancellationToken.None).AsTask());
        ex.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Theory]
    [InlineData(null, "601234567")]
    [InlineData("Lekhapal", null)]
    [InlineData("Lekhapal", "60123")]
    [InlineData("Lekhapal", "60123456X")]
    public async Task Expense_With_Tds_Should_Require_The_Vendor_And_A_Nine_Digit_Pan(string? vendor, string? pan)
    {
        await SeedChartAsync();

        var ex = await Should.ThrowAsync<CustomException>(() => Record().Handle(new RecordExpenseCommand(
            Day, "Consultancy", 2000m, "cash", VendorName: vendor, SupplierVatNumber: pan, TdsCategory: "service_non_vat"), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await _db.Expenses.CountAsync()).ShouldBe(0);
    }

    [Fact]
    public async Task Expense_Paid_In_Cash_Should_Be_Refused_When_The_Cash_Account_Is_Short()
    {
        await SeedChartAsync();

        var ex = await Should.ThrowAsync<CustomException>(() => Record().Handle(new RecordExpenseCommand(
            Day, "Generator repair", CashFloat + 1m, "cash"), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        ex.Message.ShouldContain("Not enough cash");
        (await _db.Expenses.CountAsync()).ShouldBe(0);

        // From the bank it goes through: a bank account may be overdrawn.
        await Record().Handle(new RecordExpenseCommand(Day, "Generator repair", CashFloat + 1m, "bank"), CancellationToken.None);
        (await _db.Expenses.CountAsync()).ShouldBe(1);
    }

    [Fact]
    public async Task TdsCategories_Endpoint_Should_Need_One_Of_The_Tds_Form_Permissions()
    {
        var permissions = Substitute.For<FSH.Modules.Identity.Contracts.Services.IUserPermissionService>();
        var mediator = Substitute.For<IMediator>();
        _user.GetUserId().Returns(Guid.CreateVersion7());

        await Should.ThrowAsync<ForbiddenException>(() => GetTdsCategoriesEndpoint.HandleAsync(_user, permissions, mediator, CancellationToken.None));

        permissions.HasPermissionAsync(Arg.Any<string>(), FSH.Modules.Suppliers.Contracts.Authorization.SuppliersPermissions.Ledger.RecordPayment, Arg.Any<CancellationToken>())
            .Returns(true);
        var result = await GetTdsCategoriesEndpoint.HandleAsync(_user, permissions, mediator, CancellationToken.None);
        result.ShouldNotBeNull();
        await mediator.Received(1).Send(Arg.Any<GetTdsCategoriesQuery>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Expense_Should_Refuse_A_Deactivated_Category()
    {
        await SeedChartAsync();
        await new UpdateTdsCategoriesCommandHandler(_db, _user).Handle(
            new UpdateTdsCategoriesCommand([new TdsCategoryInput("interest", "Interest", 15m, IsActive: false)]), CancellationToken.None);

        var ex = await Should.ThrowAsync<CustomException>(() => Record().Handle(new RecordExpenseCommand(
            Day, "Loan interest", 1000m, "cash", VendorName: "Lekhapal", SupplierVatNumber: "601234567", TdsCategory: "interest"), CancellationToken.None).AsTask());
        ex.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    #endregion

    #region Supplier payments

    [Fact]
    public async Task SupplierPayment_With_Tds_Should_Debit_Ap_Gross_And_Credit_Bank_Net_And_TdsPayable()
    {
        await SeedChartAsync();
        var entryId = Guid.CreateVersion7();

        await SupplierPaid().HandleAsync(SupplierPayment(entryId, 5000m, 75m));
        // Redelivery: one voucher, one deduction.
        await SupplierPaid().HandleAsync(SupplierPayment(entryId, 5000m, 75m));

        var lines = await PostedLinesAsync("SupplierPayment", entryId);
        lines.Single(l => l.AccountId == _payable.Id).DebitAmount.ShouldBe(5000m);
        lines.Single(l => l.AccountId == _bank.Id).CreditAmount.ShouldBe(4925m);
        var tdsAccountId = (await TdsAccountAsync()).Id;
        lines.Single(l => l.AccountId == tdsAccountId).CreditAmount.ShouldBe(75m);

        var deduction = await _db.TdsDeductions.SingleAsync();
        deduction.SourceType.ShouldBe(TdsDeduction.SourceTypes.SupplierPayment);
        deduction.VendorName.ShouldBe("Lekhapal Consulting");
        deduction.Pan.ShouldBe("601234567");
        deduction.CategoryName.ShouldBe("Service / consultancy (VAT-registered vendor)");
        deduction.DocumentReference.ShouldBe("INV-9");
    }

    [Fact]
    public async Task SupplierPayment_Without_Tds_Should_Post_Two_Lines_As_Before()
    {
        await SeedChartAsync();
        var entryId = Guid.CreateVersion7();

        await SupplierPaid().HandleAsync(SupplierPayment(entryId, 800m, 0m, category: null));

        var lines = await PostedLinesAsync("SupplierPayment", entryId);
        lines.Count.ShouldBe(2);
        (await _db.Accounts.AnyAsync(a => a.Code == AccountingSystemAccountCodes.TdsPayable)).ShouldBeFalse();
        (await _db.TdsDeductions.CountAsync()).ShouldBe(0);
    }

    [Fact]
    public async Task Voided_SupplierPayment_Should_Drop_Out_Of_The_Report_And_Reverse_The_Tds()
    {
        await SeedChartAsync();
        var entryId = Guid.CreateVersion7();
        await SupplierPaid().HandleAsync(SupplierPayment(entryId, 5000m, 75m));

        await new SupplierPaymentVoidedIntegrationEventHandler(TestVoucherPosting.Create(_db)).HandleAsync(
            new SupplierPaymentVoidedIntegrationEvent(Guid.NewGuid(), Day, "t", "c", "Suppliers", entryId, Guid.CreateVersion7(),
                _supplierId, "Lekhapal Consulting", 5000m, "entered twice", Day.AddDays(1)));

        (await NetAsync((await TdsAccountAsync()).Id)).ShouldBe(0m);
        var report = await Report().Handle(new GetTdsReportQuery(Day.AddDays(-1), Day.AddDays(5)), CancellationToken.None);
        report.Lines.ShouldBeEmpty();
        report.TotalTdsAmount.ShouldBe(0m);
    }

    #endregion

    #region TDS deposit

    [Fact]
    public async Task TdsPayment_Should_Debit_TdsPayable_And_Be_Capped_At_The_Balance()
    {
        await SeedChartAsync();
        await Record().Handle(new RecordExpenseCommand(Day, "Rent", 10000m, "cash", VendorName: "Lekhapal", SupplierVatNumber: "601234567", TdsCategory: "rent"), CancellationToken.None);

        var over = await Should.ThrowAsync<CustomException>(() => TdsPayment().Handle(
            new RecordTdsPaymentCommand(Day.AddDays(1), 1000.01m, "bank"), CancellationToken.None).AsTask());
        over.StatusCode.ShouldBe(HttpStatusCode.UnprocessableEntity);

        var voucherId = await TdsPayment().Handle(new RecordTdsPaymentCommand(Day.AddDays(1), 600m, "bank", "IRD-77"), CancellationToken.None);

        var voucher = await _db.Vouchers.Include(v => v.Lines).SingleAsync(v => v.Id == voucherId);
        voucher.VoucherType.ShouldBe(TdsVouchers.PaymentVoucherType);
        voucher.VoucherNo.ShouldStartWith(VoucherSeries.Payment + "-");
        var tdsAccountId = (await TdsAccountAsync()).Id;
        voucher.Lines.Single(l => l.AccountId == tdsAccountId).DebitAmount.ShouldBe(600m);
        voucher.Lines.Single(l => l.AccountId == _bank.Id).CreditAmount.ShouldBe(600m);

        // 400 left: another 400.01 is refused, 400 is fine.
        await Should.ThrowAsync<CustomException>(() => TdsPayment().Handle(
            new RecordTdsPaymentCommand(Day.AddDays(2), 400.01m, "bank"), CancellationToken.None).AsTask());
        await TdsPayment().Handle(new RecordTdsPaymentCommand(Day.AddDays(2), 400m, "bank"), CancellationToken.None);
        (await NetAsync((await TdsAccountAsync()).Id)).ShouldBe(0m);
    }

    [Fact]
    public async Task TdsPayment_Should_Be_Refused_When_Nothing_Is_Payable_Or_The_Date_Is_Locked()
    {
        await SeedChartAsync();
        var none = await Should.ThrowAsync<CustomException>(() => TdsPayment().Handle(
            new RecordTdsPaymentCommand(Day, 10m, "bank"), CancellationToken.None).AsTask());
        none.StatusCode.ShouldBe(HttpStatusCode.UnprocessableEntity);

        await Record().Handle(new RecordExpenseCommand(Day, "Rent", 10000m, "cash", VendorName: "Lekhapal", SupplierVatNumber: "601234567", TdsCategory: "rent"), CancellationToken.None);
        var lockRow = await new AccountingPostingLockService(_db).GetOrCreateAsync();
        lockRow.SetLockDate(new DateOnly(2026, 6, 30), "tester");
        await _db.SaveChangesAsync();

        await Should.ThrowAsync<Exception>(() => TdsPayment().Handle(
            new RecordTdsPaymentCommand(Day.AddDays(5), 100m, "bank"), CancellationToken.None).AsTask());
    }

    #endregion

    #region Report and settings

    [Fact]
    public async Task Report_Should_Total_Per_Category_With_Deposits_And_The_Payable_Balance()
    {
        await SeedChartAsync();
        await Record().Handle(new RecordExpenseCommand(Day, "Rent", 10000m, "cash", VendorName: "Lekhapal", SupplierVatNumber: "601234567", TdsCategory: "rent"), CancellationToken.None);
        await Record().Handle(new RecordExpenseCommand(Day.AddDays(1), "Rent store", 5000m, "cash", VendorName: "Lekhapal", SupplierVatNumber: "601234567", TdsCategory: "rent"), CancellationToken.None);
        await SupplierPaid().HandleAsync(SupplierPayment(Guid.CreateVersion7(), 2000m, 30m));
        await TdsPayment().Handle(new RecordTdsPaymentCommand(Day.AddDays(2), 1000m, "bank"), CancellationToken.None);
        // Outside the period.
        await Record().Handle(new RecordExpenseCommand(Day.AddDays(40), "Rent", 1000m, "cash", VendorName: "Lekhapal", SupplierVatNumber: "601234567", TdsCategory: "rent"), CancellationToken.None);

        var report = await Report().Handle(new GetTdsReportQuery(Day.AddDays(-1), Day.AddDays(10)), CancellationToken.None);

        report.Lines.Count.ShouldBe(3);
        report.TotalTaxableAmount.ShouldBe(17000m);
        report.TotalTdsAmount.ShouldBe(1530m);
        var rent = report.CategoryTotals.Single(t => t.CategoryCode == "rent");
        rent.Count.ShouldBe(2);
        rent.TdsAmount.ShouldBe(1500m);
        report.CategoryTotals.Single(t => t.CategoryCode == "service_vat").TdsAmount.ShouldBe(30m);
        report.TdsDeposited.ShouldBe(1000m);
        report.TdsPayableBalance.ShouldBe(530m);
    }

    [Fact]
    public void Build_Should_Sum_Lines_Per_Category()
    {
        TdsReportLineDto Line(string code, decimal taxable, decimal tds) =>
            new(Guid.NewGuid(), Day, "Expense", Guid.NewGuid(), "V", null, code, code.ToUpperInvariant(), 10m, taxable, tds, null, null);

        var dto = GetTdsReportQueryHandler.Build(Day, Day, [Line("rent", 100m, 10m), Line("rent", 50m, 5m), Line("interest", 20m, 3m)], 0m, 18m);

        dto.CategoryTotals.Count.ShouldBe(2);
        dto.CategoryTotals.Single(t => t.CategoryCode == "rent").TaxableAmount.ShouldBe(150m);
        dto.TotalTdsAmount.ShouldBe(18m);
        dto.TdsPayableBalance.ShouldBe(18m);
    }

    [Fact]
    public async Task Categories_Should_List_Defaults_And_Saved_Edits()
    {
        var defaults = await new GetTdsCategoriesQueryHandler(_db).Handle(new GetTdsCategoriesQuery(), CancellationToken.None);
        defaults.Select(c => c.Code).ShouldBe(TdsCategoryDefaults.All.Select(d => d.Code));
        defaults.Single(c => c.Code == "rent").RatePercent.ShouldBe(10m);
        defaults.Single(c => c.Code == "service_vat").RatePercent.ShouldBe(1.5m);
        defaults.Single(c => c.Code == "service_non_vat").RatePercent.ShouldBe(15m);
        defaults.Single(c => c.Code == "commission").RatePercent.ShouldBe(15m);
        defaults.Single(c => c.Code == "contract").RatePercent.ShouldBe(1.5m);
        defaults.Single(c => c.Code == "interest").RatePercent.ShouldBe(15m);

        var saved = await new UpdateTdsCategoriesCommandHandler(_db, _user).Handle(new UpdateTdsCategoriesCommand(
            [new TdsCategoryInput("RENT", "House rent", 10.5m), new TdsCategoryInput("royalty", "Royalty", 15m)]), CancellationToken.None);

        saved.Single(c => c.Code == "rent").RatePercent.ShouldBe(10.5m);
        saved.Single(c => c.Code == "rent").Name.ShouldBe("House rent");
        saved[^1].Code.ShouldBe("royalty");
        saved.Count.ShouldBe(TdsCategoryDefaults.All.Count + 1);
    }

    #endregion
}
