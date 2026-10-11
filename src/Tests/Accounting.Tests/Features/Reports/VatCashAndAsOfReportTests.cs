using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.Reports.GetArGlReconciliation;
using FSH.Modules.Accounting.Features.v1.Reports.GetCashMovement;
using FSH.Modules.Accounting.Features.v1.Reports.GetInventoryGlReconciliation;
using FSH.Modules.Accounting.Features.v1.Reports.GetVatReturn;
using FSH.Modules.Accounting.Features.v1.Vat;
using FSH.Modules.Customers.Contracts.v1.Ledger;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using NSubstitute;

namespace Accounting.Tests.Features.Reports;

/// <summary>VAT return ignores VAT settlements; cash movement covers every cash/bank account and nets
/// internal transfers; GL reconciliations honour "as of".</summary>
public sealed class VatCashAndAsOfReportTests : IDisposable
{
    private static readonly DateTime From = new(2026, 4, 1, 0, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime To = new(2026, 4, 30, 23, 59, 59, DateTimeKind.Utc);

    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private int _no;

    public VatCashAndAsOfReportTests()
    {
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>())
            .Returns(ci => ci.ArgAt<Guid?>(0));
    }

    public void Dispose() => _db.Dispose();

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

    private Task<AccountingAccount> Account(string code, AccountingAccountType type) =>
        AccountingTestChart.AddAsync(_db, code, type, isSystem: true);

    [Fact]
    public async Task VatReturn_Should_Exclude_VatPayments_And_AddUp()
    {
        var cash = await Account(AccountingSystemAccountCodes.Cash, AccountingAccountType.Asset);
        var bank = await Account(AccountingSystemAccountCodes.Bank, AccountingAccountType.Asset);
        var vat = await Account(AccountingSystemAccountCodes.VatPayable, AccountingAccountType.Liability);
        var inputVat = await Account(AccountingSystemAccountCodes.InputVatRecoverable, AccountingAccountType.Asset);
        var revenue = await Account(AccountingSystemAccountCodes.SalesRevenue, AccountingAccountType.Revenue);
        var returns = await Account(AccountingSystemAccountCodes.SalesReturnsAndAllowances, AccountingAccountType.Revenue);
        var inventory = await Account(AccountingSystemAccountCodes.Inventory, AccountingAccountType.Asset);
        var ap = await Account(AccountingSystemAccountCodes.AccountsPayable, AccountingAccountType.Liability);
        var day = From.AddDays(3);

        await PostAsync(day, "system_sale", (cash.Id, 1130m, 0m), (revenue.Id, 0m, 1000m), (vat.Id, 0m, 130m));
        await PostAsync(day, "system_sales_return", (returns.Id, 100m, 0m), (vat.Id, 13m, 0m), (cash.Id, 0m, 113m));
        await PostAsync(day, "system_purchase", (inventory.Id, 200m, 0m), (inputVat.Id, 26m, 0m), (ap.Id, 0m, 226m));
        // Paying last month's VAT (recorded through the VAT payment flow) and a manual Dr VAT / Cr Bank.
        await PostAsync(day, VatSettlement.VoucherType, (vat.Id, 90m, 0m), (bank.Id, 0m, 90m));
        await PostAsync(day, "journal", (vat.Id, 10m, 0m), (bank.Id, 0m, 10m));
        // Set-off journal of input VAT against output VAT.
        await PostAsync(day, "journal", (vat.Id, 26m, 0m), (inputVat.Id, 0m, 26m));

        var result = await new GetVatReturnQueryHandler(_db, _currentBranch).Handle(new GetVatReturnQuery(From, To), CancellationToken.None);

        result.VatCollected.ShouldBe(130m);
        result.VatRefundedOrAdjusted.ShouldBe(13m);
        result.NetVatPayable.ShouldBe(117m);
        result.InputVat.ShouldBe(26m);
        result.NetVatDue.ShouldBe(91m);
        result.VatSettled.ShouldBe(126m);
        (result.VatCollected - result.VatRefundedOrAdjusted - result.InputVat).ShouldBe(result.NetVatDue);
    }

    [Fact]
    public async Task CashMovement_Should_IncludeEveryCashAndBankAccount_And_NetInternalTransfers()
    {
        var cash = await Account(AccountingSystemAccountCodes.Cash, AccountingAccountType.Asset);
        var bank = await Account(AccountingSystemAccountCodes.Bank, AccountingAccountType.Asset);
        var pettyCash = await Account("1020", AccountingAccountType.Asset);
        var revenue = await Account(AccountingSystemAccountCodes.SalesRevenue, AccountingAccountType.Revenue);
        var expense = await Account(AccountingSystemAccountCodes.GeneralExpenses, AccountingAccountType.Expense);
        var day = From.AddDays(3);

        await PostAsync(From.AddDays(-5), "system_sale", (cash.Id, 40m, 0m), (revenue.Id, 0m, 40m)); // opening
        await PostAsync(day, "system_sale", (cash.Id, 100m, 0m), (revenue.Id, 0m, 100m));
        await PostAsync(day, "system_bank_deposit", (bank.Id, 50m, 0m), (cash.Id, 0m, 50m));
        await PostAsync(day, "system_expense", (expense.Id, 20m, 0m), (pettyCash.Id, 0m, 20m));

        var result = await new GetCashMovementQueryHandler(_db, _currentBranch).Handle(new GetCashMovementQuery(From, To), CancellationToken.None);

        result.OpeningBalance.ShouldBe(40m);
        result.TotalInflow.ShouldBe(100m);
        result.TotalOutflow.ShouldBe(20m);
        result.InternalTransfers.ShouldBe(50m);
        result.ClosingBalance.ShouldBe(120m);
    }

    [Fact]
    public async Task ArReconciliation_Should_ReadBothSides_AsOfTheRequestedDate()
    {
        var ar = await Account(AccountingSystemAccountCodes.AccountsReceivable, AccountingAccountType.Asset);
        var revenue = await Account(AccountingSystemAccountCodes.SalesRevenue, AccountingAccountType.Revenue);
        await PostAsync(From.AddDays(2), "system_sale", (ar.Id, 300m, 0m), (revenue.Id, 0m, 300m));
        await PostAsync(From.AddDays(20), "system_sale", (ar.Id, 500m, 0m), (revenue.Id, 0m, 500m));
        var asOf = From.AddDays(10);
#pragma warning disable CA2012 // NSubstitute stores the ValueTask as a configured return value.
        _mediator.Send(Arg.Any<GetTotalArBalanceQuery>(), Arg.Any<CancellationToken>())
            .Returns(ci => new ValueTask<decimal>(ci.ArgAt<GetTotalArBalanceQuery>(0).AsOfUtc == asOf ? 300m : 800m));
#pragma warning restore CA2012

        var result = await new GetArGlReconciliationQueryHandler(_db, _mediator, _currentBranch)
            .Handle(new GetArGlReconciliationQuery(AsOfUtc: asOf), CancellationToken.None);

        result.AsOfUtc.ShouldBe(asOf);
        result.SubledgerAsOfUtc.ShouldBe(asOf);
        result.GlBalance.ShouldBe(300m);
        result.SubledgerTotal.ShouldBe(300m);
        result.Variance.ShouldBe(0m);
    }

    [Fact]
    public async Task InventoryReconciliation_Should_FilterGl_AsOf_And_SayTheSubledgerIsCurrent()
    {
        var inventory = await Account(AccountingSystemAccountCodes.Inventory, AccountingAccountType.Asset);
        var ap = await Account(AccountingSystemAccountCodes.AccountsPayable, AccountingAccountType.Liability);
        await PostAsync(From.AddDays(2), "system_purchase", (inventory.Id, 300m, 0m), (ap.Id, 0m, 300m));
        await PostAsync(From.AddDays(20), "system_purchase", (inventory.Id, 500m, 0m), (ap.Id, 0m, 500m));
#pragma warning disable CA2012
        _mediator.Send(Arg.Any<GetStockValuationQuery>(), Arg.Any<CancellationToken>()).Returns(new ValueTask<decimal>(800m));
#pragma warning restore CA2012
        var asOf = From.AddDays(10);

        var result = await new GetInventoryGlReconciliationQueryHandler(_db, _mediator, _currentBranch)
            .Handle(new GetInventoryGlReconciliationQuery(AsOfUtc: asOf), CancellationToken.None);

        result.AsOfUtc.ShouldBe(asOf);
        result.GlBalance.ShouldBe(300m);
        result.SubledgerAsOfUtc.ShouldNotBeNull();
        result.SubledgerAsOfUtc!.Value.ShouldBeGreaterThan(asOf);
    }
}
