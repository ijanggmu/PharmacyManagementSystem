using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Banking;
using FSH.Modules.Accounting.Contracts.v1.Expenses;
using FSH.Modules.Accounting.Contracts.v1.PaymentAccounts;
using FSH.Modules.Accounting.Contracts.v1.Vat;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.Banking.ReconcileBankAccount;
using FSH.Modules.Accounting.Features.v1.Banking.RecordBankDeposit;
using FSH.Modules.Accounting.Features.v1.Banking.SearchBankReconciliations;
using FSH.Modules.Accounting.Features.v1.Expenses.RecordExpense;
using FSH.Modules.Accounting.Features.v1.PaymentAccounts.CreateCashBankAccount;
using FSH.Modules.Accounting.Features.v1.PaymentAccounts.GetPaymentMethodAccounts;
using FSH.Modules.Accounting.Features.v1.PaymentAccounts.UpdatePaymentMethodAccounts;
using FSH.Modules.Accounting.Features.v1.Vat.RecordVatPayment;
using FSH.Modules.Accounting.IntegrationEventHandlers;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Customers.Contracts.Events;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Events;
using FSH.Modules.Suppliers.Contracts.Events;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Accounting.Tests.Features.PaymentAccounts;

/// <summary>
/// The tenant payment-method → money-account mapping: built-in defaults (cash 1000, insurance 1190, else 1010),
/// overrides set through the settings command, target validation, and every money flow posting to the mapped
/// account (sale tenders, returns/refunds, receipts, supplier payments, expenses, VAT, deposits), plus
/// reconciliation of any cash/bank account.
/// </summary>
public sealed class PaymentMethodAccountsTests : IDisposable
{
    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();
    private readonly IVoucherPostingService _posting = Substitute.For<IVoucherPostingService>();
    private readonly ICurrentUser _user = Substitute.For<ICurrentUser>();
    private readonly ICurrentBranch _branch = Substitute.For<ICurrentBranch>();
    private readonly Dictionary<string, AccountingAccount> _chart = [];

    public PaymentMethodAccountsTests()
    {
        _user.Name.Returns("accountant");
        _branch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns((Guid?)null);
        _branch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(Guid.CreateVersion7());
    }

    public void Dispose() => _db.Dispose();

    private AccountingAccountResolver Resolver => new(_db);

    private PaymentMethodAccountResolver PaymentAccounts => new(_db, Resolver);

    private Guid Id(string code) => _chart[code].Id;

    /// <summary>Standard system accounts plus two extra money accounts: 1020 eSewa wallet, 1030 Nabil Bank.</summary>
    private async Task SeedChartAsync()
    {
        foreach (var (code, type) in new[]
        {
            (AccountingSystemAccountCodes.Cash, AccountingAccountType.Asset),
            (AccountingSystemAccountCodes.Bank, AccountingAccountType.Asset),
            (AccountingSystemAccountCodes.AccountsReceivable, AccountingAccountType.Asset),
            (AccountingSystemAccountCodes.InsuranceReceivable, AccountingAccountType.Asset),
            (AccountingSystemAccountCodes.AccountsPayable, AccountingAccountType.Liability),
            (AccountingSystemAccountCodes.VatPayable, AccountingAccountType.Liability),
            (AccountingSystemAccountCodes.SalesRevenue, AccountingAccountType.Revenue),
            (AccountingSystemAccountCodes.SalesReturnsAndAllowances, AccountingAccountType.Revenue),
            (AccountingSystemAccountCodes.GeneralExpenses, AccountingAccountType.Expense),
        })
        {
            _chart[code] = await AccountingTestChart.AddAsync(_db, code, type, isSystem: true);
        }

        _chart["1020"] = await AccountingTestChart.AddAsync(_db, "1020", AccountingAccountType.Asset);
        _chart["1030"] = await AccountingTestChart.AddAsync(_db, "1030", AccountingAccountType.Asset);
    }

    private Task<IReadOnlyList<FSH.Modules.Accounting.Contracts.Dtos.PaymentMethodAccountDto>> MapAsync(params (string Method, Guid? AccountId)[] mappings) =>
        new UpdatePaymentMethodAccountsCommandHandler(_db, _user)
            .Handle(new UpdatePaymentMethodAccountsCommand(mappings.Select(m => new PaymentMethodAccountInput(m.Method, m.AccountId)).ToList()), CancellationToken.None)
            .AsTask();

    /// <summary>eSewa → the eSewa wallet, bank → Nabil; everything else keeps its default.</summary>
    private async Task SeedMappingAsync()
    {
        await SeedChartAsync();
        await MapAsync(("esewa", Id("1020")), ("bank", Id("1030")));
    }

    private PostVoucherRequest Posted() =>
        _posting.ReceivedCalls()
            .Where(c => c.GetMethodInfo().Name == nameof(IVoucherPostingService.PostSystemVoucherAsync))
            .Select(c => (PostVoucherRequest)c.GetArguments()[0]!)
            .Single();

    private static decimal Debit(PostVoucherRequest r, Guid accountId) => r.Lines.Where(l => l.AccountId == accountId).Sum(l => l.DebitAmount);

    private static decimal Credit(PostVoucherRequest r, Guid accountId) => r.Lines.Where(l => l.AccountId == accountId).Sum(l => l.CreditAmount);

    // --- resolution ---------------------------------------------------------------------------------------

    [Theory]
    [InlineData(null, "1000")]
    [InlineData("", "1000")]
    [InlineData(" Cash ", "1000")]
    [InlineData("card", "1010")]
    [InlineData("esewa", "1010")]
    [InlineData("cheque", "1010")]
    [InlineData("online", "1010")]
    [InlineData("insurance", "1190")]
    public async Task Resolver_Should_Use_Builtin_Defaults_When_Nothing_Is_Mapped(string? method, string expectedCode)
    {
        await SeedChartAsync();

        (await PaymentAccounts.ResolveAccountIdAsync(method)).ShouldBe(Id(expectedCode));
    }

    [Fact]
    public async Task Resolver_Should_Use_The_Tenant_Mapping_And_Default_The_Rest()
    {
        await SeedMappingAsync();
        var resolver = PaymentAccounts;

        (await resolver.ResolveAccountIdAsync("ESEWA")).ShouldBe(Id("1020"));
        (await resolver.ResolveAccountIdAsync("bank")).ShouldBe(Id("1030"));
        (await resolver.ResolveAccountIdAsync("khalti")).ShouldBe(Id("1010"));
        (await resolver.ResolveAccountIdAsync("cash")).ShouldBe(Id("1000"));
    }

    [Fact]
    public async Task Unknown_Methods_Should_Follow_The_Other_Mapping()
    {
        await SeedChartAsync();
        await MapAsync(("other", Id("1030")));

        (await PaymentAccounts.ResolveAccountIdAsync("online")).ShouldBe(Id("1030"));
    }

    [Fact]
    public async Task A_Null_Account_Should_Reset_The_Method_To_Its_Default()
    {
        await SeedMappingAsync();

        var view = await MapAsync(("esewa", null));

        (await PaymentAccounts.ResolveAccountIdAsync("esewa")).ShouldBe(Id("1010"));
        var esewa = view.Single(v => v.Method == "esewa");
        esewa.IsDefault.ShouldBeTrue();
        esewa.AccountCode.ShouldBe("1010");
        (await _db.PaymentMethodAccounts.CountAsync()).ShouldBe(1);
    }

    [Fact]
    public async Task Get_Should_List_Every_Method_With_Defaults_And_Overrides()
    {
        await SeedMappingAsync();

        var view = await new GetPaymentMethodAccountsQueryHandler(_db).Handle(new GetPaymentMethodAccountsQuery(), CancellationToken.None);

        view.Select(v => v.Method).ShouldBe(["cash", "card", "bank", "cheque", "esewa", "khalti", "fonepay", "insurance", "other"]);
        view.Single(v => v.Method == "esewa").ShouldSatisfyAllConditions(
            v => v.IsDefault.ShouldBeFalse(),
            v => v.AccountCode.ShouldBe("1020"),
            v => v.DefaultAccountCode.ShouldBe("1010"));
        view.Single(v => v.Method == "cash").ShouldSatisfyAllConditions(v => v.IsDefault.ShouldBeTrue(), v => v.AccountCode.ShouldBe("1000"));
        view.Single(v => v.Method == "insurance").AccountCode.ShouldBe("1190");
    }

    // --- validation ---------------------------------------------------------------------------------------

    [Fact]
    public async Task A_Non_Cash_Bank_Asset_Should_Be_Refused_For_A_Money_Method()
    {
        await SeedChartAsync();

        await Should.ThrowAsync<CustomException>(() => MapAsync(("esewa", Id(AccountingSystemAccountCodes.AccountsReceivable))));
        (await _db.PaymentMethodAccounts.CountAsync()).ShouldBe(0);
    }

    [Fact]
    public async Task Insurance_Should_Accept_Any_Leaf_Asset()
    {
        await SeedChartAsync();

        await MapAsync(("insurance", Id(AccountingSystemAccountCodes.AccountsReceivable)));

        (await PaymentAccounts.ResolveAccountIdAsync("insurance")).ShouldBe(Id(AccountingSystemAccountCodes.AccountsReceivable));
    }

    [Fact]
    public async Task Non_Asset_Inactive_And_Group_Accounts_Should_Be_Refused()
    {
        await SeedChartAsync();
        var group = await AccountingTestChart.AddAsync(_db, "1040", AccountingAccountType.Asset);
        await AccountingTestChart.AddAsync(_db, "104001", AccountingAccountType.Asset, parent: group);
        _chart["1030"].Deactivate();
        await _db.SaveChangesAsync();

        await Should.ThrowAsync<CustomException>(() => MapAsync(("insurance", Id(AccountingSystemAccountCodes.VatPayable))));
        await Should.ThrowAsync<CustomException>(() => MapAsync(("bank", Id("1030"))));
        await Should.ThrowAsync<CustomException>(() => MapAsync(("bank", group.Id)));
        await Should.ThrowAsync<NotFoundException>(() => MapAsync(("bank", Guid.CreateVersion7())));
    }

    [Fact]
    public void Validator_Should_Refuse_Unknown_And_Repeated_Methods()
    {
        var validator = new UpdatePaymentMethodAccountsCommandValidator();

        validator.Validate(new UpdatePaymentMethodAccountsCommand([new("paypal", Guid.CreateVersion7())])).IsValid.ShouldBeFalse();
        validator.Validate(new UpdatePaymentMethodAccountsCommand([new("esewa", Guid.CreateVersion7()), new("ESEWA", null)])).IsValid.ShouldBeFalse();
        validator.Validate(new UpdatePaymentMethodAccountsCommand([])).IsValid.ShouldBeFalse();
        validator.Validate(new UpdatePaymentMethodAccountsCommand([new("Khalti", Guid.CreateVersion7()), new("cash", null)])).IsValid.ShouldBeTrue();
    }

    [Fact]
    public async Task CreateCashBankAccount_Should_Take_The_Next_Free_10xx_Code_Under_Assets()
    {
        var assets = await AccountingTestChart.RootAsync(_db, AccountingAccountType.Asset);
        await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.Cash, AccountingAccountType.Asset, isSystem: true);
        await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.Bank, AccountingAccountType.Asset, isSystem: true);
        var handler = new CreateCashBankAccountCommandHandler(_db);

        var first = await handler.Handle(new CreateCashBankAccountCommand("Nabil Bank"), CancellationToken.None);
        var second = await handler.Handle(new CreateCashBankAccountCommand("eSewa wallet"), CancellationToken.None);

        var created = await _db.Accounts.AsNoTracking().Where(a => a.Id == first || a.Id == second).OrderBy(a => a.Code).ToListAsync();
        created.Select(a => a.Code).ShouldBe(["1020", "1030"]);
        created.ShouldAllBe(a => a.ParentId == assets.Id && a.AccountType == AccountingAccountType.Asset && !a.IsSystem);
    }

    // --- posting paths ------------------------------------------------------------------------------------

    [Fact]
    public async Task Sale_Tenders_Should_Debit_Each_Methods_Mapped_Account()
    {
        await SeedMappingAsync();

        await new SaleCompletedIntegrationEventHandler(_posting, Resolver, PaymentAccounts).HandleAsync(new SaleCompletedIntegrationEvent(
            Guid.NewGuid(), DateTime.UtcNow, "t", "c", "Sales", Guid.CreateVersion7(), Guid.CreateVersion7(), null, null,
            "mixed", 113m, 113m, 0m, 13m, 0m, [],
            [new SaleCompletedPayment("esewa", 50m), new SaleCompletedPayment("cash", 40m), new SaleCompletedPayment("card", 23m)]));

        var posted = Posted();
        Debit(posted, Id("1020")).ShouldBe(50m);
        Debit(posted, Id("1000")).ShouldBe(40m);
        Debit(posted, Id("1010")).ShouldBe(23m);
    }

    [Fact]
    public async Task Return_Should_Credit_The_Refund_Methods_Account_And_Original_Payment_The_Bank_Mapping()
    {
        await SeedMappingAsync();
        var handler = new ReturnCompletedIntegrationEventHandler(_posting, Resolver, PaymentAccounts);

        await handler.HandleAsync(ReturnEvent(refundMethod: "esewa"));
        var toWallet = Posted();
        Credit(toWallet, Id("1020")).ShouldBe(80m);
        Credit(toWallet, Id("1000")).ShouldBe(33m);

        _posting.ClearReceivedCalls();
        await handler.HandleAsync(ReturnEvent(refundMethod: "original_payment"));
        Credit(Posted(), Id("1030")).ShouldBe(80m);
    }

    [Fact]
    public async Task Refund_To_An_Unmapped_Method_Should_Fall_Back_To_Its_Default()
    {
        await SeedMappingAsync();

        await new RefundCompletedIntegrationEventHandler(_posting, Resolver, PaymentAccounts).HandleAsync(new RefundCompletedIntegrationEvent(
            Guid.CreateVersion7(), DateTime.UtcNow, "t", "c", "Sales", Guid.CreateVersion7(), Guid.CreateVersion7(), Guid.CreateVersion7(),
            NetRefundAmount: 113m, CustomerId: null, GrossRefundAmount: 113m, VatAmount: 13m,
            CashAmount: 0m, BankAmount: 113m, OnAccountAmount: 0m, SaleTotalAmount: 113m, ItemsAmount: 113m, RefundMethod: "card"));

        Credit(Posted(), Id("1010")).ShouldBe(113m);
    }

    [Fact]
    public async Task Customer_And_Supplier_Payments_Should_Use_The_Mapped_Account()
    {
        await SeedMappingAsync();

        await new CustomerPaymentRecordedIntegrationEventHandler(_posting, Resolver, PaymentAccounts).HandleAsync(
            new CustomerPaymentRecordedIntegrationEvent(
                Guid.NewGuid(), DateTime.UtcNow, "t", "c", "Customers", Guid.NewGuid(), Guid.NewGuid(), "Ram", 150m, null, PaymentMethod: "esewa"));
        Debit(Posted(), Id("1020")).ShouldBe(150m);

        _posting.ClearReceivedCalls();
        await new SupplierPaymentRecordedIntegrationEventHandler(_posting, Resolver, PaymentAccounts).HandleAsync(
            new SupplierPaymentRecordedIntegrationEvent(
                Guid.NewGuid(), DateTime.UtcNow, "t", "c", "Suppliers", Guid.NewGuid(), Guid.NewGuid(), "Acme", 80m, null, PaymentMethod: "bank"));
        Credit(Posted(), Id("1030")).ShouldBe(80m);
    }

    [Fact]
    public async Task Expense_And_Vat_Payment_Should_Credit_The_Mapped_Account()
    {
        await SeedMappingAsync();
        var postingLock = new AccountingPostingLockService(_db);

        await new RecordExpenseCommandHandler(_db, _posting, Resolver, PaymentAccounts, _user, _branch, postingLock)
            .Handle(new RecordExpenseCommand(DateTime.UtcNow, "Rent", 500m, "esewa"), CancellationToken.None);
        Credit(Posted(), Id("1020")).ShouldBe(500m);

        _posting.ClearReceivedCalls();
        await new RecordVatPaymentCommandHandler(_posting, Resolver, PaymentAccounts, _branch, postingLock)
            .Handle(new RecordVatPaymentCommand(DateTime.UtcNow, 1300m, "bank"), CancellationToken.None);
        Credit(Posted(), Id("1030")).ShouldBe(1300m);
    }

    [Fact]
    public async Task Deposit_Should_Go_To_The_Selected_Account_Else_The_Bank_Mapping()
    {
        await SeedMappingAsync();
        var handler = new RecordBankDepositCommandHandler(_db, _posting, PaymentAccounts, _user, _branch, new AccountingPostingLockService(_db));

        var defaultId = await handler.Handle(new RecordBankDepositCommand(DateTime.UtcNow, 200m), CancellationToken.None);
        var toDefault = Posted();
        Debit(toDefault, Id("1030")).ShouldBe(200m);
        Credit(toDefault, Id("1000")).ShouldBe(200m);

        _posting.ClearReceivedCalls();
        var selectedId = await handler.Handle(new RecordBankDepositCommand(DateTime.UtcNow, 70m, AccountId: Id("1020")), CancellationToken.None);
        Debit(Posted(), Id("1020")).ShouldBe(70m);

        (await _db.BankDeposits.AsNoTracking().SingleAsync(d => d.Id == defaultId)).AccountId.ShouldBe(Id("1030"));
        (await _db.BankDeposits.AsNoTracking().SingleAsync(d => d.Id == selectedId)).AccountId.ShouldBe(Id("1020"));
    }

    [Fact]
    public async Task Deposit_Should_Refuse_A_Non_Bank_Or_The_Cash_Account_Itself()
    {
        await SeedMappingAsync();
        var handler = new RecordBankDepositCommandHandler(_db, _posting, PaymentAccounts, _user, _branch, new AccountingPostingLockService(_db));

        Task DepositTo(string code) =>
            handler.Handle(new RecordBankDepositCommand(DateTime.UtcNow, 70m, AccountId: Id(code)), CancellationToken.None).AsTask();

        await Should.ThrowAsync<CustomException>(() => DepositTo(AccountingSystemAccountCodes.AccountsReceivable));
        await Should.ThrowAsync<CustomException>(() => DepositTo(AccountingSystemAccountCodes.Cash));
        (await _db.BankDeposits.CountAsync()).ShouldBe(0);
    }

    // --- reconciliation -----------------------------------------------------------------------------------

    [Fact]
    public async Task Reconcile_Should_Compare_The_Selected_Account_And_Default_To_Bank()
    {
        await SeedChartAsync();
        var realPosting = TestVoucherPosting.Create(_db);
        await PostAsync(realPosting, Id("1020"), 100m);
        await PostAsync(realPosting, Id("1010"), 40m);
        var handler = new ReconcileBankAccountCommandHandler(_db, _user, _branch);

        var walletId = await handler.Handle(new ReconcileBankAccountCommand(DateTime.UtcNow.AddMinutes(1), 120m, AccountId: Id("1020")), CancellationToken.None);
        var bankId = await handler.Handle(new ReconcileBankAccountCommand(DateTime.UtcNow.AddMinutes(1), 40m), CancellationToken.None);

        var wallet = await _db.BankReconciliations.AsNoTracking().SingleAsync(r => r.Id == walletId);
        wallet.ShouldSatisfyAllConditions(r => r.GlBalance.ShouldBe(100m), r => r.Variance.ShouldBe(20m), r => r.AccountId.ShouldBe(Id("1020")));
        var bank = await _db.BankReconciliations.AsNoTracking().SingleAsync(r => r.Id == bankId);
        bank.ShouldSatisfyAllConditions(r => r.GlBalance.ShouldBe(40m), r => r.AccountId.ShouldBe(Id("1010")));

        var search = new SearchBankReconciliationsQueryHandler(_db, _branch);
        (await search.Handle(new SearchBankReconciliationsQuery(AccountId: Id("1020")), CancellationToken.None)).Items.Select(i => i.Id).ShouldBe([walletId]);
    }

    [Fact]
    public async Task Reconcile_Should_Refuse_An_Account_Outside_Cash_And_Bank()
    {
        await SeedChartAsync();

        await Should.ThrowAsync<CustomException>(() => new ReconcileBankAccountCommandHandler(_db, _user, _branch)
            .Handle(new ReconcileBankAccountCommand(DateTime.UtcNow, 10m, AccountId: Id(AccountingSystemAccountCodes.AccountsReceivable)), CancellationToken.None).AsTask());
    }

    private async Task PostAsync(VoucherPostingService posting, Guid moneyAccountId, decimal amount) =>
        await posting.PostSystemVoucherAsync(new PostVoucherRequest(
            "system_sale", "Sale", Guid.CreateVersion7(), "Sale",
            [
                new PostVoucherLine(moneyAccountId, "Received", amount, 0m),
                new PostVoucherLine(Id(AccountingSystemAccountCodes.SalesRevenue), "Revenue", 0m, amount),
            ],
            VoucherDateUtc: DateTime.UtcNow.AddMinutes(-5)));

    private static ReturnCompletedIntegrationEvent ReturnEvent(string refundMethod) => new(
        Guid.CreateVersion7(), DateTime.UtcNow, "t", "c", "Sales", Guid.CreateVersion7(), Guid.CreateVersion7(), Guid.CreateVersion7(),
        TotalReturnAmount: 113m, Lines: [], CustomerId: null, VatAmount: 13m, CashAmount: 33m, BankAmount: 80m, OnAccountAmount: 0m,
        SaleTotalAmount: 226m, RefundMethod: refundMethod);
}
