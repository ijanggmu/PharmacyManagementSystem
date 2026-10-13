using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.IntegrationEventHandlers;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Payroll.Contracts.Events;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Accounting.Tests.Features.Vouchers;

/// <summary>Payroll postings: the accrual journal on post (balanced, payroll accounts created on first use) and the salary
/// payment on pay (Dr Salaries Payable / Cr the payment method's account) — each once per run.</summary>
public sealed class PayrollRunIntegrationEventHandlerTests : IDisposable
{
    private static readonly DateTime PostedOn = new(2025, 8, 16, 0, 0, 0, DateTimeKind.Utc);

    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();
    private readonly Guid _branchId = Guid.CreateVersion7();
    private readonly Guid _runId = Guid.CreateVersion7();

    public void Dispose() => _db.Dispose();

    private PayrollRunPostedIntegrationEvent Posted() =>
        // Net pay is the gross less the employee SSF, CIT, TDS and other deduction below.
        new(Guid.NewGuid(), PostedOn, "test-tenant", "corr", "Payroll", _runId, _branchId, "Shrawan 2082", PostedOn,
            TotalGross: 160_000m, TotalEmployeeSsf: 6_600m, TotalEmployerSsf: 12_000m, TotalCit: 5_000m,
            TotalTds: 12_923.33m, TotalOtherDeductions: 500m, TotalNet: 134_976.67m);

    private PayrollRunPostedIntegrationEventHandler PostedHandler() => new(_db, TestVoucherPosting.Create(_db));

    private async Task<Guid> AccountIdAsync(string code) => await _db.Accounts.Where(a => a.Code == code).Select(a => a.Id).SingleAsync();

    [Fact]
    public async Task Posted_Should_BookBalancedAccrual_OnPayrollAccounts()
    {
        await AccountingTestChart.RootAsync(_db, AccountingAccountType.Liability);
        await AccountingTestChart.RootAsync(_db, AccountingAccountType.Expense);

        await PostedHandler().HandleAsync(Posted());

        var voucher = await _db.Vouchers.Include(v => v.Lines).SingleAsync();
        voucher.VoucherType.ShouldBe(PayrollVoucherTypes.Accrual);
        voucher.ReferenceType.ShouldBe(PayrollVoucherTypes.AccrualReference);
        voucher.ReferenceId.ShouldBe(_runId);
        voucher.BranchId.ShouldBe(_branchId);
        voucher.VoucherDateUtc.ShouldBe(PostedOn);
        voucher.Lines.Sum(l => l.DebitAmount).ShouldBe(voucher.Lines.Sum(l => l.CreditAmount));
        voucher.Lines.Sum(l => l.DebitAmount).ShouldBe(172_000m);

        var salary = await AccountIdAsync(AccountingSystemAccountCodes.SalaryExpense);
        var employerSsf = await AccountIdAsync(AccountingSystemAccountCodes.EmployerSsfExpense);
        var payable = await AccountIdAsync(AccountingSystemAccountCodes.SalariesPayable);
        var ssf = await AccountIdAsync(AccountingSystemAccountCodes.SsfPayable);
        var tds = await AccountIdAsync(AccountingSystemAccountCodes.SalaryTdsPayable);
        var cit = await AccountIdAsync(AccountingSystemAccountCodes.CitPayable);
        var other = await AccountIdAsync(AccountingSystemAccountCodes.PayrollDeductionsPayable);

        voucher.Lines.ShouldContain(l => l.AccountId == salary && l.DebitAmount == 160_000m);
        voucher.Lines.ShouldContain(l => l.AccountId == employerSsf && l.DebitAmount == 12_000m);
        voucher.Lines.ShouldContain(l => l.AccountId == payable && l.CreditAmount == 134_976.67m);
        voucher.Lines.ShouldContain(l => l.AccountId == ssf && l.CreditAmount == 18_600m);
        voucher.Lines.ShouldContain(l => l.AccountId == tds && l.CreditAmount == 12_923.33m);
        voucher.Lines.ShouldContain(l => l.AccountId == cit && l.CreditAmount == 5_000m);
        voucher.Lines.ShouldContain(l => l.AccountId == other && l.CreditAmount == 500m);

        (await _db.Accounts.Where(a => a.Code == AccountingSystemAccountCodes.SalariesPayable).SingleAsync()).IsSystem.ShouldBeTrue();
    }

    [Fact]
    public async Task Posted_Should_LeaveOutZeroLines_And_PostOnce()
    {
        var @event = Posted() with
        {
            TotalEmployeeSsf = 0m, TotalEmployerSsf = 0m, TotalCit = 0m, TotalOtherDeductions = 0m, TotalTds = 10_000m, TotalNet = 150_000m,
        };

        await PostedHandler().HandleAsync(@event);
        await PostedHandler().HandleAsync(@event with { Id = Guid.NewGuid() });

        var voucher = await _db.Vouchers.Include(v => v.Lines).SingleAsync();
        voucher.Lines.Count.ShouldBe(3);
    }

    [Fact]
    public async Task Posted_Should_Refuse_UserAccountHoldingPayrollCode()
    {
        await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.SalariesPayable, AccountingAccountType.Liability);

        await Should.ThrowAsync<FSH.Framework.Core.Exceptions.CustomException>(() => PostedHandler().HandleAsync(Posted()));
    }

    [Fact]
    public async Task Paid_Should_DebitSalariesPayable_And_CreditBank()
    {
        var bank = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.Bank, AccountingAccountType.Asset, isSystem: true);
        var resolver = Substitute.For<IAccountingAccountResolver>();
        resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Bank, Arg.Any<CancellationToken>()).Returns(bank.Id);
        var handler = new PayrollRunPaidIntegrationEventHandler(_db, TestVoucherPosting.Create(_db), TestPaymentAccounts.For(resolver, _db));
        var paidOn = PostedOn.AddDays(2);
        var @event = new PayrollRunPaidIntegrationEvent(
            Guid.NewGuid(), paidOn, "test-tenant", "corr", "Payroll", _runId, _branchId, "Shrawan 2082", 134_976.67m, "bank", paidOn);

        await handler.HandleAsync(@event);
        await handler.HandleAsync(@event with { Id = Guid.NewGuid() });

        var voucher = await _db.Vouchers.Include(v => v.Lines).SingleAsync();
        voucher.VoucherType.ShouldBe(PayrollVoucherTypes.Payment);
        voucher.ReferenceType.ShouldBe(PayrollVoucherTypes.PaymentReference);
        voucher.VoucherDateUtc.ShouldBe(paidOn);
        var payable = await AccountIdAsync(AccountingSystemAccountCodes.SalariesPayable);
        voucher.Lines.ShouldContain(l => l.AccountId == payable && l.DebitAmount == 134_976.67m);
        voucher.Lines.ShouldContain(l => l.AccountId == bank.Id && l.CreditAmount == 134_976.67m);
    }
}
