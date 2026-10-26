using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.IntegrationEventHandlers;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Appointments.Contracts.Events;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Accounting.Tests.Features.Vouchers;

/// <summary>Doctor appointment postings: a fee's receipt split between Consultation Fee Income and Doctor Fees Payable,
/// its reversal when the fee is given back, and the doctor's payout — each once per reference.</summary>
public sealed class AppointmentIntegrationEventHandlerTests : IDisposable
{
    private static readonly DateTime PaidOn = new(2026, 11, 1, 10, 0, 0, DateTimeKind.Utc);

    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();
    private readonly Guid _branchId = Guid.CreateVersion7();
    private readonly Guid _appointmentId = Guid.CreateVersion7();

    public void Dispose() => _db.Dispose();

    private async Task<Guid> AccountIdAsync(string code) => await _db.Accounts.Where(a => a.Code == code).Select(a => a.Id).SingleAsync();

    private async Task<IPaymentMethodAccountResolver> CashAccountsAsync()
    {
        var cash = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.Cash, AccountingAccountType.Asset, isSystem: true);
        var resolver = Substitute.For<IAccountingAccountResolver>();
        resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Cash, Arg.Any<CancellationToken>()).Returns(cash.Id);
        return TestPaymentAccounts.For(resolver, _db);
    }

    private ConsultationFeeCollectedIntegrationEvent Collected(decimal amount = 500m, decimal share = 400m) =>
        new(Guid.NewGuid(), PaidOn, "test-tenant", "corr", "Appointments", _appointmentId, _branchId, "Dr. Sharma", "Hari", 7,
            amount, share, "cash", PaidOn);

    [Fact]
    public async Task Fee_Should_DebitCash_And_SplitBetweenDoctorPayable_AndIncome_Once()
    {
        await AccountingTestChart.RootAsync(_db, AccountingAccountType.Liability);
        await AccountingTestChart.RootAsync(_db, AccountingAccountType.Revenue);
        var handler = new ConsultationFeeCollectedIntegrationEventHandler(_db, TestVoucherPosting.Create(_db), await CashAccountsAsync());

        await handler.HandleAsync(Collected());
        await handler.HandleAsync(Collected());

        var voucher = await _db.Vouchers.Include(v => v.Lines).SingleAsync();
        voucher.VoucherType.ShouldBe(AppointmentVoucherTypes.Fee);
        voucher.ReferenceType.ShouldBe(AppointmentVoucherTypes.FeeReference);
        voucher.ReferenceId.ShouldBe(_appointmentId);
        voucher.BranchId.ShouldBe(_branchId);
        voucher.VoucherDateUtc.ShouldBe(PaidOn);
        voucher.Lines.Sum(l => l.DebitAmount).ShouldBe(500m);
        voucher.Lines.Sum(l => l.CreditAmount).ShouldBe(500m);
        var cash = await AccountIdAsync(AccountingSystemAccountCodes.Cash);
        var payable = await AccountIdAsync(AccountingSystemAccountCodes.DoctorFeesPayable);
        var income = await AccountIdAsync(AccountingSystemAccountCodes.ConsultationFeeIncome);
        voucher.Lines.ShouldContain(l => l.AccountId == cash && l.DebitAmount == 500m);
        voucher.Lines.ShouldContain(l => l.AccountId == payable && l.CreditAmount == 400m);
        voucher.Lines.ShouldContain(l => l.AccountId == income && l.CreditAmount == 100m);
        (await _db.Accounts.SingleAsync(a => a.Code == AccountingSystemAccountCodes.ConsultationFeeIncome)).AccountType.ShouldBe(AccountingAccountType.Revenue);
    }

    [Fact]
    public async Task Fee_Should_LeaveOutTheIncomeLine_WhenTheDoctorGetsItAll()
    {
        var handler = new ConsultationFeeCollectedIntegrationEventHandler(_db, TestVoucherPosting.Create(_db), await CashAccountsAsync());

        await handler.HandleAsync(Collected(amount: 300m, share: 300m));

        var voucher = await _db.Vouchers.Include(v => v.Lines).SingleAsync();
        voucher.Lines.Count.ShouldBe(2);
        (await _db.Accounts.AnyAsync(a => a.Code == AccountingSystemAccountCodes.ConsultationFeeIncome)).ShouldBeFalse();
    }

    [Fact]
    public async Task Refund_Should_ReverseTheFeeReceipt()
    {
        var accounts = await CashAccountsAsync();
        var posting = TestVoucherPosting.Create(_db);
        await new ConsultationFeeCollectedIntegrationEventHandler(_db, posting, accounts).HandleAsync(Collected());

        await new ConsultationFeeRefundedIntegrationEventHandler(posting).HandleAsync(
            new ConsultationFeeRefundedIntegrationEvent(
                Guid.NewGuid(), PaidOn.AddHours(1), "test-tenant", "corr", "Appointments", _appointmentId, _branchId,
                "Doctor didn't come", PaidOn.AddHours(1)));

        var vouchers = await _db.Vouchers.Include(v => v.Lines).ToListAsync();
        vouchers.Count.ShouldBe(2);
        var cash = await AccountIdAsync(AccountingSystemAccountCodes.Cash);
        vouchers.SelectMany(v => v.Lines).Where(l => l.AccountId == cash).Sum(l => l.DebitAmount - l.CreditAmount).ShouldBe(0m);
    }

    [Fact]
    public async Task Payout_Should_DebitDoctorPayable_And_CreditCash_Once()
    {
        var handler = new DoctorPayoutPaidIntegrationEventHandler(_db, TestVoucherPosting.Create(_db), await CashAccountsAsync());
        var payoutId = Guid.CreateVersion7();
        var @event = new DoctorPayoutPaidIntegrationEvent(
            Guid.NewGuid(), PaidOn, "test-tenant", "corr", "Appointments", payoutId, _branchId, "Dr. Sharma", 3_200m, "cash", PaidOn);

        await handler.HandleAsync(@event);
        await handler.HandleAsync(@event with { Id = Guid.NewGuid() });

        var voucher = await _db.Vouchers.Include(v => v.Lines).SingleAsync();
        voucher.VoucherType.ShouldBe(AppointmentVoucherTypes.Payout);
        voucher.ReferenceId.ShouldBe(payoutId);
        var payable = await AccountIdAsync(AccountingSystemAccountCodes.DoctorFeesPayable);
        var cash = await AccountIdAsync(AccountingSystemAccountCodes.Cash);
        voucher.Lines.ShouldContain(l => l.AccountId == payable && l.DebitAmount == 3_200m);
        voucher.Lines.ShouldContain(l => l.AccountId == cash && l.CreditAmount == 3_200m);
    }

    [Fact]
    public void Fee_And_Payout_Are_Numbered_As_Receipt_And_Payment()
    {
        VoucherSeries.ForVoucherType(AppointmentVoucherTypes.Fee).ShouldBe(VoucherSeries.Receipt);
        VoucherSeries.ForVoucherType(AppointmentVoucherTypes.Payout).ShouldBe(VoucherSeries.Payment);
    }
}
