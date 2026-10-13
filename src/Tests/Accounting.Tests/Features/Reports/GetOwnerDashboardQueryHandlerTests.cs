using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.Reports.GetOwnerDashboard;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.Reports;
using FSH.Modules.Sales.Contracts.v1.Sales;
using Mediator;
using Microsoft.Extensions.Caching.Hybrid;
using Microsoft.Extensions.DependencyInjection;
using NSubstitute;

namespace Accounting.Tests.Features.Reports;

public sealed class GetOwnerDashboardQueryHandlerTests : IDisposable
{
    // 2026-10-13 10:00 NPT.
    private static readonly DateTime Now = new(2026, 10, 13, 4, 15, 0, DateTimeKind.Utc);
    private static readonly DateTime TodayStartUtc = new(2026, 10, 12, 18, 15, 0, DateTimeKind.Utc);
    private static readonly DateTime MonthStartUtc = new(2026, 9, 30, 18, 15, 0, DateTimeKind.Utc);

    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly TimeProvider _time = Substitute.For<TimeProvider>();
    private readonly ServiceProvider _services = new ServiceCollection().AddHybridCache().Services.BuildServiceProvider();
    private int _no;

    public GetOwnerDashboardQueryHandlerTests()
    {
        _time.GetUtcNow().Returns(new DateTimeOffset(Now));
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0));

        _mediator.Send(Arg.Any<GetSalesStatsQuery>(), Arg.Any<CancellationToken>())
            .Returns(ci => ci.ArgAt<GetSalesStatsQuery>(0).DateFromUtc == TodayStartUtc
                ? new SalesStatsDto(3, 1130m, 0m, 376.67m)
                : new SalesStatsDto(40, 22600m, 100m, 565m));
        _mediator.Send(Arg.Any<GetStockValuationQuery>(), Arg.Any<CancellationToken>()).Returns(50000m);
        _mediator.Send(Arg.Any<GetMedicineMarginsQuery>(), Arg.Any<CancellationToken>())
            .Returns(Array.Empty<MedicineMarginDto>());
    }

    public void Dispose()
    {
        _db.Dispose();
        _services.Dispose();
    }

    private GetOwnerDashboardQueryHandler CreateSut(string tenantId = "acme")
    {
        var accessor = Substitute.For<IMultiTenantContextAccessor<AppTenantInfo>>();
        accessor.MultiTenantContext.Returns(new MultiTenantContext<AppTenantInfo>(new AppTenantInfo(tenantId, tenantId)));
        return new GetOwnerDashboardQueryHandler(
            _db, _mediator, _currentBranch, _services.GetRequiredService<HybridCache>(), accessor, _time);
    }

    private Task<AccountingAccount> Account(string code, AccountingAccountType type) =>
        AccountingTestChart.AddAsync(_db, code, type, isSystem: true);

    private async Task PostAsync(DateTime dateUtc, Guid? branchId, params (Guid Account, decimal Debit, decimal Credit)[] lines)
    {
        var voucher = AccountingVoucher.CreateDraft(dateUtc, "system_sale", AccountingVoucherSource.System, "t", branchId: branchId);
        foreach (var (account, debit, credit) in lines)
        {
            voucher.AddLine(account, null, debit, credit);
        }

        voucher.Post($"SV-{++_no:D3}", "tester");
        _db.Vouchers.Add(voucher);
        await _db.SaveChangesAsync();
    }

    [Fact]
    public async Task Handle_Composes_Sales_Stock_And_Ledger_Kpis()
    {
        var cash = await Account(AccountingSystemAccountCodes.Cash, AccountingAccountType.Asset);
        var bank = await Account(AccountingSystemAccountCodes.Bank, AccountingAccountType.Asset);
        var ar = await Account(AccountingSystemAccountCodes.AccountsReceivable, AccountingAccountType.Asset);
        var ap = await Account(AccountingSystemAccountCodes.AccountsPayable, AccountingAccountType.Liability);
        var vat = await Account(AccountingSystemAccountCodes.VatPayable, AccountingAccountType.Liability);
        var inputVat = await Account(AccountingSystemAccountCodes.InputVatRecoverable, AccountingAccountType.Asset);
        var revenue = await Account(AccountingSystemAccountCodes.SalesRevenue, AccountingAccountType.Revenue);
        var returns = await Account(AccountingSystemAccountCodes.SalesReturnsAndAllowances, AccountingAccountType.Revenue);
        var cogs = await Account(AccountingSystemAccountCodes.CostOfGoodsSold, AccountingAccountType.Expense);
        var inventory = await Account(AccountingSystemAccountCodes.Inventory, AccountingAccountType.Asset);

        // Last month: counts for balances, not for the month's margin.
        await PostAsync(MonthStartUtc.AddDays(-5), null, (cash.Id, 565m, 0m), (revenue.Id, 0m, 500m), (vat.Id, 0m, 65m));
        // This month: a cash sale, a credit sale, a return, COGS, a purchase on credit and a bank deposit.
        await PostAsync(MonthStartUtc.AddDays(2), null, (cash.Id, 1130m, 0m), (revenue.Id, 0m, 1000m), (vat.Id, 0m, 130m));
        await PostAsync(MonthStartUtc.AddDays(3), null, (ar.Id, 2260m, 0m), (revenue.Id, 0m, 2000m), (vat.Id, 0m, 260m));
        await PostAsync(MonthStartUtc.AddDays(4), null, (returns.Id, 100m, 0m), (vat.Id, 13m, 0m), (cash.Id, 0m, 113m));
        await PostAsync(MonthStartUtc.AddDays(4), null, (cogs.Id, 1740m, 0m), (inventory.Id, 0m, 1740m));
        await PostAsync(MonthStartUtc.AddDays(5), null, (inventory.Id, 1000m, 0m), (inputVat.Id, 130m, 0m), (ap.Id, 0m, 1130m));
        await PostAsync(MonthStartUtc.AddDays(6), null, (bank.Id, 500m, 0m), (cash.Id, 0m, 500m));
        // After "now": ignored.
        await PostAsync(Now.AddDays(1), null, (cash.Id, 999m, 0m), (revenue.Id, 0m, 999m));

        var result = await CreateSut().Handle(new GetOwnerDashboardQuery(), CancellationToken.None);

        result.TodayStartUtc.ShouldBe(TodayStartUtc);
        result.MonthStartUtc.ShouldBe(MonthStartUtc); // Gregorian month in Nepal time by default
        result.TodaySales.ShouldBe(1130m);
        result.TodaySaleCount.ShouldBe(3);
        result.MonthSales.ShouldBe(22600m);
        result.StockValue.ShouldBe(50000m);

        result.MonthNetSales.ShouldBe(2900m);               // 1000 + 2000 - 100
        result.MonthCostOfGoodsSold.ShouldBe(1740m);
        result.MonthGrossProfit.ShouldBe(1160m);
        result.GrossMarginPercent.ShouldBe(40.0m);

        result.Receivables.ShouldBe(2260m);
        result.Payables.ShouldBe(1130m);
        result.VatPayable.ShouldBe(65m + 130m + 260m - 13m - 130m);
        result.CashAndBankBalance.ShouldBe(565m + 1130m - 113m);
        result.CashAndBankAccounts.Select(a => (a.Code, a.Balance))
            .ShouldBe([(AccountingSystemAccountCodes.Cash, 565m + 1130m - 113m - 500m), (AccountingSystemAccountCodes.Bank, 500m)]);
        result.TopMedicinesByMargin.ShouldBeEmpty();
    }

    [Fact]
    public async Task Handle_Scopes_Everything_To_The_Resolved_Branch()
    {
        var branchA = Guid.NewGuid();
        var pinned = Guid.NewGuid();
        var cash = await Account(AccountingSystemAccountCodes.Cash, AccountingAccountType.Asset);
        var revenue = await Account(AccountingSystemAccountCodes.SalesRevenue, AccountingAccountType.Revenue);
        await PostAsync(MonthStartUtc.AddDays(1), branchA, (cash.Id, 100m, 0m), (revenue.Id, 0m, 100m));
        await PostAsync(MonthStartUtc.AddDays(1), pinned, (cash.Id, 40m, 0m), (revenue.Id, 0m, 40m));

        // A user without Branches.ViewAll asking for "all" is confined to their branch.
        _currentBranch.ResolveListBranchFilterAsync(null, Arg.Any<CancellationToken>()).Returns(pinned);

        var result = await CreateSut().Handle(new GetOwnerDashboardQuery(), CancellationToken.None);

        result.BranchId.ShouldBe(pinned);
        result.CashAndBankBalance.ShouldBe(40m);
        result.MonthNetSales.ShouldBe(40m);
        await _mediator.Received().Send(Arg.Is<GetSalesStatsQuery>(q => q.BranchId == pinned), Arg.Any<CancellationToken>());
        await _mediator.Received().Send(Arg.Is<GetStockValuationQuery>(q => q.BranchId == pinned), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_Names_The_Top_Medicines_And_Uses_The_Callers_Month()
    {
        var bsMonthStart = new DateTime(2026, 9, 16, 18, 15, 0, DateTimeKind.Utc);
        var medicine = Guid.NewGuid();
        _mediator.Send(Arg.Is<GetMedicineMarginsQuery>(q => q.FromUtc == bsMonthStart && q.Take == 5), Arg.Any<CancellationToken>())
            .Returns(new[] { new MedicineMarginDto(medicine, 10m, 500m, 300m, 200m, 40m) });
        _mediator.Send(Arg.Any<GetMedicineNamesQuery>(), Arg.Any<CancellationToken>())
            .Returns(new Dictionary<Guid, string> { [medicine] = "Paracetamol 500mg" });

        var result = await CreateSut().Handle(new GetOwnerDashboardQuery(MonthStartUtc: bsMonthStart), CancellationToken.None);

        result.MonthStartUtc.ShouldBe(bsMonthStart);
        result.GrossMarginPercent.ShouldBeNull(); // no GL sales yet
        var top = result.TopMedicinesByMargin.ShouldHaveSingleItem();
        top.Name.ShouldBe("Paracetamol 500mg");
        top.Margin.ShouldBe(200m);
    }

    [Fact]
    public async Task Handle_Serves_Repeat_Calls_From_The_Cache_Per_Tenant()
    {
        var sut = CreateSut("acme");

        await sut.Handle(new GetOwnerDashboardQuery(), CancellationToken.None);
        await sut.Handle(new GetOwnerDashboardQuery(), CancellationToken.None);
        await _mediator.Received(1).Send(Arg.Any<GetStockValuationQuery>(), Arg.Any<CancellationToken>());

        await CreateSut("other").Handle(new GetOwnerDashboardQuery(), CancellationToken.None);
        await _mediator.Received(2).Send(Arg.Any<GetStockValuationQuery>(), Arg.Any<CancellationToken>());
    }

    private static readonly AsyncLocal<string?> RequestTenant = new();

    [Fact]
    public async Task Handle_Builds_On_The_Requests_Execution_Context()
    {
        // Regression: HybridCache runs its factory without the ExecutionContext, so the tenant (an AsyncLocal in
        // Finbuckle) was gone and the Sales query threw in production. The module queries must see the caller's flow.
        var seen = new List<string?>();
        _mediator.Send(Arg.Any<GetStockValuationQuery>(), Arg.Any<CancellationToken>())
            .Returns(_ =>
            {
                seen.Add(RequestTenant.Value);
                return 50000m;
            });

        // A cancellable token, like HttpContext.RequestAborted — HybridCache only isolates the factory onto the
        // thread pool when the caller can cancel.
        using var requestAborted = new CancellationTokenSource();
        RequestTenant.Value = "acme";
        await CreateSut().Handle(new GetOwnerDashboardQuery(), requestAborted.Token);

        seen.ShouldBe(["acme"]);
    }

    [Theory]
    [InlineData(1000, 600, 40.0)]
    [InlineData(1000, 1100, -10.0)]
    [InlineData(3, 1, 66.7)]
    public void GrossMarginPercent_Is_Profit_Over_Net_Sales(decimal netSales, decimal cogs, decimal expected) =>
        OwnerDashboardMath.GrossMarginPercent(netSales, cogs).ShouldBe(expected);

    [Fact]
    public void Validator_Rejects_A_Month_Start_Far_In_The_Past()
    {
        var validator = new GetOwnerDashboardQueryValidator();

        validator.Validate(new GetOwnerDashboardQuery()).IsValid.ShouldBeTrue();
        validator.Validate(new GetOwnerDashboardQuery(MonthStartUtc: DateTime.UtcNow.AddDays(-20))).IsValid.ShouldBeTrue();
        validator.Validate(new GetOwnerDashboardQuery(MonthStartUtc: DateTime.UtcNow.AddDays(-120))).IsValid.ShouldBeFalse();
        validator.Validate(new GetOwnerDashboardQuery(MonthStartUtc: DateTime.UtcNow.AddDays(5))).IsValid.ShouldBeFalse();
    }
}
