using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Events;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Expenses;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.Expenses;
using FSH.Modules.Accounting.Features.v1.Expenses.DeleteExpense;
using FSH.Modules.Accounting.Features.v1.Expenses.RecordExpense;
using FSH.Modules.Accounting.Features.v1.Expenses.UpdateExpense;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Reference.Contracts.Dtos;
using FSH.Modules.Reference.Contracts.v1.Settings;
using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using Mediator;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Accounting.Tests.Features.Expenses;

/// <summary>
/// Expense postings for each mode, against a real voucher posting service and chart: the chosen expense account,
/// input VAT (entered, or split out of a VAT-inclusive amount at the tenant rate), paid now vs pay later (Accounts
/// Payable + a bill event for the supplier's AP ledger), and edits/deletes keeping the voucher and payable consistent.
/// </summary>
public sealed class ExpenseAccountingModesTests : IDisposable
{
    private static readonly DateTime Day = new(2026, 6, 10, 0, 0, 0, DateTimeKind.Utc);

    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();
    private readonly ICurrentUser _user = Substitute.For<ICurrentUser>();
    private readonly ICurrentBranch _branch = Substitute.For<ICurrentBranch>();
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly Guid _supplierId = Guid.CreateVersion7();

    private AccountingAccount _general = default!;
    private AccountingAccount _rent = default!;
    private AccountingAccount _cash = default!;
    private AccountingAccount _bank = default!;
    private AccountingAccount _inputVat = default!;
    private AccountingAccount _payable = default!;
    private AccountingAccount _cogs = default!;
    private AccountingAccount _revenue = default!;

    public ExpenseAccountingModesTests()
    {
        _user.Name.Returns("manager1");
        _branch.CanViewAllBranchesAsync(Arg.Any<CancellationToken>()).Returns(true);
        _mediator.Send(Arg.Any<GetPharmacySettingsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new PharmacySettingsDto(Guid.NewGuid(), "Pharmacy", null, null, null, "NPR", 13m, "INV", 1, null));
        _mediator.Send(Arg.Is<GetSupplierByIdQuery>(q => q.SupplierId == _supplierId), Arg.Any<CancellationToken>())
            .Returns(Supplier(isActive: true));
        BillsAre(paid: 0m);
    }

    public void Dispose() => _db.Dispose();

    private SupplierDto Supplier(bool isActive) =>
        new(_supplierId, "Nepal Telecom", null, null, null, null, "301234567", 0m, isActive, DateTime.UtcNow, null);

    private void BillsAre(decimal paid, Guid? expenseId = null)
    {
        var bills = new List<SupplierBillDto>();
        if (expenseId is { } id)
        {
            string status = paid > 0 ? "partially_paid" : "open";
            bills.Add(new SupplierBillDto(Guid.NewGuid(), Day, "Purchase", ExpenseBillReference.ReferenceType, id, null, "B-1", null,
                1130m, paid, 0m, 1130m - paid, status, 0, null));
        }

        _mediator.Send(Arg.Any<GetSupplierOpenBillsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new SupplierOpenBillsDto(_supplierId, 0m, 0m, bills));
    }

    private async Task SeedChartAsync()
    {
        _general = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.GeneralExpenses, AccountingAccountType.Expense, isSystem: true);
        _rent = await AccountingTestChart.AddAsync(_db, "5200", AccountingAccountType.Expense);
        _cogs = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.CostOfGoodsSold, AccountingAccountType.Expense, isSystem: true);
        _cash = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.Cash, AccountingAccountType.Asset, isSystem: true);
        _bank = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.Bank, AccountingAccountType.Asset, isSystem: true);
        _inputVat = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.InputVatRecoverable, AccountingAccountType.Asset, isSystem: true);
        _payable = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.AccountsPayable, AccountingAccountType.Liability, isSystem: true);
        _revenue = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.SalesRevenue, AccountingAccountType.Revenue, isSystem: true);
    }

    private RecordExpenseCommandHandler Record() =>
        new(_db, TestVoucherPosting.Create(_db), new AccountingAccountResolver(_db),
            TestPaymentAccounts.For(new AccountingAccountResolver(_db), _db), _user, _branch, new AccountingPostingLockService(_db), _mediator, _outbox);

    private UpdateExpenseCommandHandler Update() =>
        new(_db, TestVoucherPosting.Create(_db), new AccountingAccountResolver(_db),
            TestPaymentAccounts.For(new AccountingAccountResolver(_db), _db), _user, _branch, new AccountingPostingLockService(_db), _mediator);

    private DeleteExpenseCommandHandler Delete() =>
        new(_db, TestVoucherPosting.Create(_db), _user, _branch, _mediator, _outbox);

    /// <summary>Net movement (debit − credit) on an account across every voucher, reversals included.</summary>
    private async Task<decimal> NetAsync(AccountingAccount account) =>
        (await _db.VoucherLines.Where(l => l.AccountId == account.Id).ToListAsync()).Sum(l => l.DebitAmount - l.CreditAmount);

    private async Task<List<AccountingVoucherLine>> PostedLinesAsync(Guid expenseId)
    {
        var voucher = await _db.Vouchers.Include(v => v.Lines)
            .SingleAsync(v => v.ReferenceType == "Expense" && v.ReferenceId == expenseId && v.Status == AccountingVoucherStatus.Posted);
        return voucher.Lines.ToList();
    }

    #region Record

    [Fact]
    public async Task Record_Should_DebitGeneralExpenses_When_NoAccountChosen()
    {
        await SeedChartAsync();

        var id = await Record().Handle(new RecordExpenseCommand(Day, "Rent", 500m, "cash"), CancellationToken.None);

        var lines = await PostedLinesAsync(id);
        lines.Count.ShouldBe(2);
        lines.Single(l => l.AccountId == _general.Id).DebitAmount.ShouldBe(500m);
        lines.Single(l => l.AccountId == _cash.Id).CreditAmount.ShouldBe(500m);
        (await _db.Expenses.SingleAsync()).ExpenseAccountId.ShouldBe(_general.Id);
    }

    [Fact]
    public async Task Record_Should_SplitInputVat_ToTheChosenAccount_When_VatAmountGiven()
    {
        await SeedChartAsync();

        var id = await Record().Handle(new RecordExpenseCommand(
            Day, "Rent", 1130m, "bank", ReceiptReference: "B-77", ExpenseAccountId: _rent.Id, VatAmount: 130m, SupplierVatNumber: "601234567"),
            CancellationToken.None);

        var lines = await PostedLinesAsync(id);
        lines.Single(l => l.AccountId == _rent.Id).DebitAmount.ShouldBe(1000m);
        lines.Single(l => l.AccountId == _inputVat.Id).DebitAmount.ShouldBe(130m);
        lines.Single(l => l.AccountId == _bank.Id).CreditAmount.ShouldBe(1130m);
        var expense = await _db.Expenses.SingleAsync();
        expense.VatAmount.ShouldBe(130m);
        expense.NetAmount.ShouldBe(1000m);
        expense.SupplierVatNumber.ShouldBe("601234567");
        await _outbox.DidNotReceive().AddAsync(Arg.Any<ExpenseBillRecordedIntegrationEvent>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Record_Should_SplitVat_AtTheTenantRate_When_AmountIncludesVat()
    {
        await SeedChartAsync();

        var id = await Record().Handle(new RecordExpenseCommand(
            Day, "Internet", 1000m, "cash", ReceiptReference: "B-1", AmountIncludesVat: true, SupplierVatNumber: "601234567"),
            CancellationToken.None);

        // 1000 × 13 / 113 = 115.044… → 115.04
        var lines = await PostedLinesAsync(id);
        lines.Single(l => l.AccountId == _inputVat.Id).DebitAmount.ShouldBe(115.04m);
        lines.Single(l => l.AccountId == _general.Id).DebitAmount.ShouldBe(884.96m);
        lines.Single(l => l.AccountId == _cash.Id).CreditAmount.ShouldBe(1000m);
    }

    [Fact]
    public async Task Record_Should_CreditAccountsPayable_And_PublishTheBill_When_PayLater()
    {
        await SeedChartAsync();
        var branchId = Guid.CreateVersion7();
        _branch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(branchId);

        var id = await Record().Handle(new RecordExpenseCommand(
            Day, "Internet", 1130m, string.Empty, "June internet", "NT-55", ExpenseAccountId: _rent.Id, VatAmount: 130m, SupplierId: _supplierId),
            CancellationToken.None);

        var lines = await PostedLinesAsync(id);
        lines.Single(l => l.AccountId == _payable.Id).CreditAmount.ShouldBe(1130m);
        lines.Single(l => l.AccountId == _payable.Id).Description.ShouldBe("Payable to Nepal Telecom");
        lines.ShouldNotContain(l => l.AccountId == _cash.Id || l.AccountId == _bank.Id);

        var expense = await _db.Expenses.SingleAsync();
        expense.SupplierId.ShouldBe(_supplierId);
        expense.PaymentMethod.ShouldBe(Expense.CreditPaymentMethod);
        expense.VendorName.ShouldBe("Nepal Telecom");
        expense.SupplierVatNumber.ShouldBe("301234567"); // taken from the supplier when not entered

        await _outbox.Received(1).AddAsync(
            Arg.Is<ExpenseBillRecordedIntegrationEvent>(e =>
                e.ExpenseId == id && e.SupplierId == _supplierId && e.Amount == 1130m && e.ExpenseDateUtc == Day
                && e.BillNumber == "NT-55" && e.BranchId == branchId && e.Source == "Accounting"),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Record_Should_Refuse_AnInactiveSupplier()
    {
        await SeedChartAsync();
        _mediator.Send(Arg.Is<GetSupplierByIdQuery>(q => q.SupplierId == _supplierId), Arg.Any<CancellationToken>())
            .Returns(Supplier(isActive: false));

        await Should.ThrowAsync<CustomException>(() => Record().Handle(
            new RecordExpenseCommand(Day, "Internet", 100m, string.Empty, SupplierId: _supplierId), CancellationToken.None).AsTask());
        (await _db.Expenses.CountAsync()).ShouldBe(0);
    }

    [Fact]
    public async Task Record_Should_Refuse_AccountsThatAreNotLedgerExpenseAccounts()
    {
        await SeedChartAsync();
        var group = await AccountingTestChart.AddAsync(_db, "5300", AccountingAccountType.Expense);
        await AccountingTestChart.AddAsync(_db, "5310", AccountingAccountType.Expense, group);

        foreach (var account in new[] { _revenue, _cogs, group })
        {
            await Should.ThrowAsync<CustomException>(() => Record().Handle(
                new RecordExpenseCommand(Day, "Rent", 10m, "cash", ExpenseAccountId: account.Id), CancellationToken.None).AsTask());
        }

        await Should.ThrowAsync<CustomException>(() => Record().Handle(
            new RecordExpenseCommand(Day, "Rent", 10m, "cash", ExpenseAccountId: Guid.NewGuid()), CancellationToken.None).AsTask());
        (await _db.Vouchers.CountAsync()).ShouldBe(0);
    }

    [Fact]
    public async Task Record_Should_Refuse_AVatBill_WithoutTheSellersVatNumber()
    {
        await SeedChartAsync();

        await Should.ThrowAsync<CustomException>(() => Record().Handle(
            new RecordExpenseCommand(Day, "Rent", 1130m, "cash", ReceiptReference: "B-1", VatAmount: 130m), CancellationToken.None).AsTask());
    }

    [Fact]
    public async Task Record_Should_Refuse_AmountIncludesVat_When_NoTenantVatRate()
    {
        await SeedChartAsync();
        _mediator.Send(Arg.Any<GetPharmacySettingsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new PharmacySettingsDto(Guid.NewGuid(), "Pharmacy", null, null, null, "NPR", 0m, "INV", 1, null));

        await Should.ThrowAsync<CustomException>(() => Record().Handle(
            new RecordExpenseCommand(Day, "Rent", 1130m, "cash", ReceiptReference: "B-1", AmountIncludesVat: true, SupplierVatNumber: "6"),
            CancellationToken.None).AsTask());
    }

    #endregion

    #region Update

    [Fact]
    public async Task Update_Should_RepostWithTheNewAccountAndVat_And_NetTheOldPostingToZero()
    {
        await SeedChartAsync();
        var id = await Record().Handle(new RecordExpenseCommand(Day, "Rent", 1130m, "cash"), CancellationToken.None);

        await Update().Handle(new UpdateExpenseCommand(
            id, "Rent", 1130m, "cash", ReceiptReference: "B-9", ExpenseAccountId: _rent.Id, VatAmount: 130m, SupplierVatNumber: "601234567"),
            CancellationToken.None);

        (await NetAsync(_general)).ShouldBe(0m);
        (await NetAsync(_rent)).ShouldBe(1000m);
        (await NetAsync(_inputVat)).ShouldBe(130m);
        (await NetAsync(_cash)).ShouldBe(-1130m);
    }

    [Fact]
    public async Task Update_Should_KeepTheCurrentAccount_When_NoneIsSent()
    {
        await SeedChartAsync();
        var id = await Record().Handle(new RecordExpenseCommand(Day, "Rent", 100m, "cash", ExpenseAccountId: _rent.Id), CancellationToken.None);

        await Update().Handle(new UpdateExpenseCommand(id, "Rent", 120m, "bank"), CancellationToken.None);

        (await NetAsync(_rent)).ShouldBe(120m);
        (await NetAsync(_cash)).ShouldBe(0m);
        (await NetAsync(_bank)).ShouldBe(-120m);
    }

    [Fact]
    public async Task Update_Should_ReSplitAPayLaterExpense_WithoutMovingThePayable()
    {
        await SeedChartAsync();
        var id = await Record().Handle(new RecordExpenseCommand(Day, "Internet", 1130m, string.Empty, SupplierId: _supplierId), CancellationToken.None);

        await Update().Handle(new UpdateExpenseCommand(
            id, "Internet", 1130m, string.Empty, ReceiptReference: "NT-1", ExpenseAccountId: _rent.Id, VatAmount: 130m, SupplierId: _supplierId),
            CancellationToken.None);

        (await NetAsync(_payable)).ShouldBe(-1130m);
        (await NetAsync(_rent)).ShouldBe(1000m);
        (await NetAsync(_inputVat)).ShouldBe(130m);
        var expense = await _db.Expenses.SingleAsync();
        expense.SupplierId.ShouldBe(_supplierId);
        expense.VendorName.ShouldBe("Nepal Telecom");
        expense.SupplierVatNumber.ShouldBe("301234567");
    }

    [Fact]
    public async Task Update_Should_Refuse_ChangingThePayableOfAPayLaterExpense()
    {
        await SeedChartAsync();
        var id = await Record().Handle(new RecordExpenseCommand(Day, "Internet", 1130m, string.Empty, SupplierId: _supplierId), CancellationToken.None);

        await Should.ThrowAsync<CustomException>(() => Update().Handle(
            new UpdateExpenseCommand(id, "Internet", 1200m, string.Empty, SupplierId: _supplierId), CancellationToken.None).AsTask());
        await Should.ThrowAsync<CustomException>(() => Update().Handle(
            new UpdateExpenseCommand(id, "Internet", 1130m, string.Empty, ExpenseDateUtc: Day.AddDays(1), SupplierId: _supplierId), CancellationToken.None).AsTask());
        await Should.ThrowAsync<CustomException>(() => Update().Handle(
            new UpdateExpenseCommand(id, "Internet", 1130m, "cash"), CancellationToken.None).AsTask());
        await Should.ThrowAsync<CustomException>(() => Update().Handle(
            new UpdateExpenseCommand(id, "Internet", 1130m, string.Empty, SupplierId: Guid.NewGuid()), CancellationToken.None).AsTask());

        (await _db.Vouchers.CountAsync()).ShouldBe(1);
    }

    [Fact]
    public async Task Update_Should_Refuse_SwitchingAPaidExpenseToPayLater()
    {
        await SeedChartAsync();
        var id = await Record().Handle(new RecordExpenseCommand(Day, "Rent", 100m, "cash"), CancellationToken.None);

        await Should.ThrowAsync<CustomException>(() => Update().Handle(
            new UpdateExpenseCommand(id, "Rent", 100m, string.Empty, SupplierId: _supplierId), CancellationToken.None).AsTask());
    }

    #endregion

    #region Delete

    [Fact]
    public async Task Delete_Should_ReverseAPaidExpense_WithoutTouchingSuppliers()
    {
        await SeedChartAsync();
        var id = await Record().Handle(new RecordExpenseCommand(Day, "Rent", 1130m, "cash", ReceiptReference: "B", VatAmount: 130m, SupplierVatNumber: "6"), CancellationToken.None);

        await Delete().Handle(new DeleteExpenseCommand(id), CancellationToken.None);

        (await NetAsync(_general)).ShouldBe(0m);
        (await NetAsync(_inputVat)).ShouldBe(0m);
        (await NetAsync(_cash)).ShouldBe(0m);
        (await _db.Expenses.CountAsync()).ShouldBe(0);
        await _outbox.DidNotReceive().AddAsync(Arg.Any<ExpenseBillVoidedIntegrationEvent>(), Arg.Any<CancellationToken>());
        await _mediator.DidNotReceive().Send(Arg.Any<GetSupplierOpenBillsQuery>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Delete_Should_ReverseThePayable_And_PublishTheBillVoid_When_PayLater()
    {
        await SeedChartAsync();
        var id = await Record().Handle(new RecordExpenseCommand(Day, "Internet", 1130m, string.Empty, ReceiptReference: "NT-5", SupplierId: _supplierId), CancellationToken.None);
        BillsAre(paid: 0m, expenseId: id);

        await Delete().Handle(new DeleteExpenseCommand(id), CancellationToken.None);

        (await NetAsync(_payable)).ShouldBe(0m);
        (await NetAsync(_general)).ShouldBe(0m);
        await _outbox.Received(1).AddAsync(
            Arg.Is<ExpenseBillVoidedIntegrationEvent>(e => e.ExpenseId == id && e.SupplierId == _supplierId && e.Amount == 1130m && e.BillNumber == "NT-5"),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Delete_Should_Refuse_When_TheSupplierBillHasBeenPaid()
    {
        await SeedChartAsync();
        var id = await Record().Handle(new RecordExpenseCommand(Day, "Internet", 1130m, string.Empty, SupplierId: _supplierId), CancellationToken.None);
        BillsAre(paid: 500m, expenseId: id);

        await Should.ThrowAsync<CustomException>(() => Delete().Handle(new DeleteExpenseCommand(id), CancellationToken.None).AsTask());

        (await _db.Expenses.CountAsync()).ShouldBe(1);
        (await NetAsync(_payable)).ShouldBe(-1130m);
        await _outbox.DidNotReceive().AddAsync(Arg.Any<ExpenseBillVoidedIntegrationEvent>(), Arg.Any<CancellationToken>());
    }

    #endregion

    #region Validators and helpers

    [Fact]
    public void RecordValidator_Should_RequirePaymentMethod_OnlyWhenPaidNow()
    {
        var validator = new RecordExpenseCommandValidator();

        validator.Validate(new RecordExpenseCommand(Day, "Rent", 10m, string.Empty)).IsValid.ShouldBeFalse();
        validator.Validate(new RecordExpenseCommand(Day, "Rent", 10m, string.Empty, SupplierId: Guid.NewGuid())).IsValid.ShouldBeTrue();
    }

    [Fact]
    public void RecordValidator_Should_CheckTheVatBill()
    {
        var validator = new RecordExpenseCommandValidator();

        // VAT not below the amount.
        validator.Validate(new RecordExpenseCommand(Day, "Rent", 100m, "cash", ReceiptReference: "B", VatAmount: 100m, SupplierVatNumber: "6")).IsValid.ShouldBeFalse();
        validator.Validate(new RecordExpenseCommand(Day, "Rent", 100m, "cash", ReceiptReference: "B", VatAmount: -1m, SupplierVatNumber: "6")).IsValid.ShouldBeFalse();
        // A VAT bill needs the bill number and, when paid now, the seller's VAT number.
        validator.Validate(new RecordExpenseCommand(Day, "Rent", 113m, "cash", VatAmount: 13m, SupplierVatNumber: "6")).IsValid.ShouldBeFalse();
        validator.Validate(new RecordExpenseCommand(Day, "Rent", 113m, "cash", ReceiptReference: "B", AmountIncludesVat: true)).IsValid.ShouldBeFalse();
        validator.Validate(new RecordExpenseCommand(Day, "Rent", 113m, "cash", ReceiptReference: "B", AmountIncludesVat: true, SupplierVatNumber: "6")).IsValid.ShouldBeTrue();
        // Owed to a supplier: its VAT number on file is used.
        validator.Validate(new RecordExpenseCommand(Day, "Rent", 113m, string.Empty, ReceiptReference: "B", VatAmount: 13m, SupplierId: Guid.NewGuid())).IsValid.ShouldBeTrue();
        // An explicit zero VAT is not a VAT bill.
        validator.Validate(new RecordExpenseCommand(Day, "Rent", 113m, "cash", VatAmount: 0m)).IsValid.ShouldBeTrue();
    }

    [Fact]
    public void UpdateValidator_Should_CheckTheVatBill_And_PaymentMethod()
    {
        var validator = new UpdateExpenseCommandValidator();
        var id = Guid.NewGuid();

        validator.Validate(new UpdateExpenseCommand(id, "Rent", 10m, string.Empty)).IsValid.ShouldBeFalse();
        validator.Validate(new UpdateExpenseCommand(id, "Rent", 10m, string.Empty, SupplierId: Guid.NewGuid())).IsValid.ShouldBeTrue();
        validator.Validate(new UpdateExpenseCommand(id, "Rent", 113m, "cash", VatAmount: 13m)).IsValid.ShouldBeFalse();
        validator.Validate(new UpdateExpenseCommand(id, "Rent", 113m, "cash", ReceiptReference: "B", VatAmount: 13m, SupplierVatNumber: "6")).IsValid.ShouldBeTrue();
    }

    [Theory]
    [InlineData(1130, 13, 130)]
    [InlineData(1000, 13, 115.04)]
    [InlineData(100, 0.5, 0.5)]
    public void VatIncluded_Should_SplitTheRateOutOfTheGross(decimal gross, decimal rate, decimal expected) =>
        ExpensePosting.VatIncluded(gross, rate).ShouldBe(expected);

    #endregion
}
