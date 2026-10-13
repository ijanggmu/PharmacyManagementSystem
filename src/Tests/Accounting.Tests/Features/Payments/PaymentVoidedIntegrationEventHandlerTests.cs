using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.IntegrationEventHandlers;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Customers.Contracts.Events;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.Events;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;

namespace Accounting.Tests.Features.Payments;

/// <summary>
/// Voiding a customer or supplier payment reverses the payment's system voucher through the system reversal path:
/// a reversing voucher dated at the void (moved to the first open day when that is locked), the original kept and
/// marked void, redeliveries ignored, and a void that arrives before the payment's own voucher is honoured when the
/// payment is finally posted.
/// </summary>
public sealed class PaymentVoidedIntegrationEventHandlerTests : IDisposable
{
    private static readonly DateTime PaidAt = new(2026, 4, 2, 6, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime VoidedAt = new(2026, 4, 10, 6, 0, 0, DateTimeKind.Utc);

    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();
    private readonly IAccountingVoucherNumbers _numbers = Substitute.For<IAccountingVoucherNumbers>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly IBranchService _branchService = Substitute.For<IBranchService>();
    private readonly IAccountingAccountResolver _resolver = Substitute.For<IAccountingAccountResolver>();
    private int _next;

    public PaymentVoidedIntegrationEventHandlerTests()
    {
        _numbers.ReserveNextNumberAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(_ => Task.FromResult(++_next));
    }

    public void Dispose() => _db.Dispose();

    private VoucherPostingService Posting() =>
        new(_db, _numbers, new AccountingPostingLockService(_db), _currentBranch, _branchService, NullLogger<VoucherPostingService>.Instance);

    private async Task<(Guid Cash, Guid Receivable, Guid Payable)> ChartAsync()
    {
        var cash = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.Cash, AccountingAccountType.Asset, isSystem: true);
        var ar = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.AccountsReceivable, AccountingAccountType.Asset, isSystem: true);
        var ap = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.AccountsPayable, AccountingAccountType.Liability, isSystem: true);
        await AccountingTestChart.RootAsync(_db, AccountingAccountType.Expense);
        _resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Cash, Arg.Any<CancellationToken>()).Returns(cash.Id);
        _resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.AccountsReceivable, Arg.Any<CancellationToken>()).Returns(ar.Id);
        _resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.AccountsPayable, Arg.Any<CancellationToken>()).Returns(ap.Id);
        return (cash.Id, ar.Id, ap.Id);
    }

    private static CustomerPaymentRecordedIntegrationEvent CustomerPaid(Guid paymentId) =>
        new(Guid.NewGuid(), PaidAt, "t", "c", "Customers", paymentId, Guid.CreateVersion7(), "Ram", 150m, "RCP-1",
            BranchId: Guid.CreateVersion7(), PaymentMethod: "cash", PaymentDateUtc: PaidAt);

    private static CustomerPaymentVoidedIntegrationEvent CustomerVoided(Guid paymentId, DateTime? deliveredAt = null) =>
        new(Guid.NewGuid(), deliveredAt ?? VoidedAt, "t", "c", "Customers", paymentId, Guid.CreateVersion7(), Guid.CreateVersion7(),
            "Ram", 150m, "keyed twice", VoidedAt, ReceiptNumber: "RCP-1");

    private static SupplierPaymentRecordedIntegrationEvent SupplierPaid(Guid paymentId) =>
        new(Guid.NewGuid(), PaidAt, "t", "c", "Suppliers", paymentId, Guid.CreateVersion7(), "Himal", 80m, null,
            BranchId: Guid.CreateVersion7(), PaymentMethod: "cash", PaymentDateUtc: PaidAt);

    private static SupplierPaymentVoidedIntegrationEvent SupplierVoided(Guid paymentId) =>
        new(Guid.NewGuid(), VoidedAt, "t", "c", "Suppliers", paymentId, Guid.CreateVersion7(), Guid.CreateVersion7(),
            "Himal", 80m, "wrong supplier", VoidedAt);

    private async Task LockBooksAsync(DateOnly lockDate)
    {
        var lockRow = await new AccountingPostingLockService(_db).GetOrCreateAsync();
        lockRow.SetLockDate(lockDate, "tester");
        await _db.SaveChangesAsync();
    }

    [Fact]
    public async Task CustomerPaymentVoided_Should_Reverse_The_Payment_Voucher_At_The_Void_Date()
    {
        var (cash, ar, _) = await ChartAsync();
        var paymentId = Guid.CreateVersion7();
        await new CustomerPaymentRecordedIntegrationEventHandler(Posting(), _resolver, TestPaymentAccounts.For(_resolver, _db)).HandleAsync(CustomerPaid(paymentId));
        var original = await _db.Vouchers.SingleAsync(v => v.ReferenceType == "CustomerPayment" && v.ReferenceId == paymentId);

        // Delivered days after the void (a retried dispatch): still dated at the void.
        await new CustomerPaymentVoidedIntegrationEventHandler(Posting()).HandleAsync(CustomerVoided(paymentId, VoidedAt.AddDays(3)));

        (await _db.Vouchers.SingleAsync(v => v.Id == original.Id)).Status.ShouldBe(AccountingVoucherStatus.Void);
        var reversal = await _db.Vouchers.Include(v => v.Lines).SingleAsync(v => v.ReversesVoucherId == original.Id);
        reversal.Status.ShouldBe(AccountingVoucherStatus.Posted);
        reversal.VoucherDateUtc.ShouldBe(VoidedAt);
        reversal.Narration!.ShouldContain("keyed twice");
        reversal.Lines.Single(l => l.AccountId == cash).CreditAmount.ShouldBe(150m);
        reversal.Lines.Single(l => l.AccountId == ar).DebitAmount.ShouldBe(150m);
    }

    [Fact]
    public async Task CustomerPaymentVoided_Redelivery_Should_Be_A_NoOp()
    {
        await ChartAsync();
        var paymentId = Guid.CreateVersion7();
        await new CustomerPaymentRecordedIntegrationEventHandler(Posting(), _resolver, TestPaymentAccounts.For(_resolver, _db)).HandleAsync(CustomerPaid(paymentId));
        var voided = CustomerVoided(paymentId);

        await new CustomerPaymentVoidedIntegrationEventHandler(Posting()).HandleAsync(voided);
        await new CustomerPaymentVoidedIntegrationEventHandler(Posting()).HandleAsync(voided);

        (await _db.Vouchers.CountAsync()).ShouldBe(2);
    }

    [Fact]
    public async Task CustomerPaymentVoided_Before_The_Payment_Is_Posted_Should_Reverse_It_On_Arrival()
    {
        await ChartAsync();
        var paymentId = Guid.CreateVersion7();

        await new CustomerPaymentVoidedIntegrationEventHandler(Posting()).HandleAsync(CustomerVoided(paymentId));
        (await _db.Vouchers.AnyAsync()).ShouldBeFalse();
        (await _db.PendingReversals.SingleAsync()).ReferenceId.ShouldBe(paymentId);

        await new CustomerPaymentRecordedIntegrationEventHandler(Posting(), _resolver, TestPaymentAccounts.For(_resolver, _db)).HandleAsync(CustomerPaid(paymentId));

        var original = await _db.Vouchers.SingleAsync(v => v.ReferenceType == "CustomerPayment" && v.ReferenceId == paymentId);
        original.Status.ShouldBe(AccountingVoucherStatus.Void);
        (await _db.Vouchers.SingleAsync(v => v.ReversesVoucherId == original.Id)).VoucherDateUtc.ShouldBe(VoidedAt);
    }

    [Fact]
    public async Task CustomerPaymentVoided_In_A_Locked_Period_Should_Move_The_Reversal_To_The_Open_Period()
    {
        await ChartAsync();
        var paymentId = Guid.CreateVersion7();
        await new CustomerPaymentRecordedIntegrationEventHandler(Posting(), _resolver, TestPaymentAccounts.For(_resolver, _db)).HandleAsync(CustomerPaid(paymentId));
        await LockBooksAsync(new DateOnly(2026, 4, 30));

        await new CustomerPaymentVoidedIntegrationEventHandler(Posting()).HandleAsync(CustomerVoided(paymentId));

        var original = await _db.Vouchers.SingleAsync(v => v.ReferenceType == "CustomerPayment");
        var reversal = await _db.Vouchers.SingleAsync(v => v.ReversesVoucherId == original.Id);
        NepalDate.FromUtc(reversal.VoucherDateUtc).ShouldBeGreaterThan(new DateOnly(2026, 4, 30));
        // The locked period keeps the payment as filed.
        original.VoucherDateUtc.ShouldBe(PaidAt);
    }

    [Fact]
    public async Task SupplierPaymentVoided_Should_Reverse_The_Payment_Voucher_At_The_Void_Date()
    {
        var (cash, _, ap) = await ChartAsync();
        var paymentId = Guid.CreateVersion7();
        await new SupplierPaymentRecordedIntegrationEventHandler(Posting(), _resolver, TestPaymentAccounts.For(_resolver, _db), _db).HandleAsync(SupplierPaid(paymentId));
        var original = await _db.Vouchers.SingleAsync(v => v.ReferenceType == "SupplierPayment" && v.ReferenceId == paymentId);

        await new SupplierPaymentVoidedIntegrationEventHandler(Posting()).HandleAsync(SupplierVoided(paymentId));
        await new SupplierPaymentVoidedIntegrationEventHandler(Posting()).HandleAsync(SupplierVoided(paymentId));

        (await _db.Vouchers.SingleAsync(v => v.Id == original.Id)).Status.ShouldBe(AccountingVoucherStatus.Void);
        var reversal = await _db.Vouchers.Include(v => v.Lines).SingleAsync(v => v.ReversesVoucherId == original.Id);
        reversal.VoucherDateUtc.ShouldBe(VoidedAt);
        reversal.Narration!.ShouldContain("wrong supplier");
        reversal.Lines.Single(l => l.AccountId == cash).DebitAmount.ShouldBe(80m);
        reversal.Lines.Single(l => l.AccountId == ap).CreditAmount.ShouldBe(80m);
        (await _db.Vouchers.CountAsync()).ShouldBe(2);
    }

    [Fact]
    public async Task Voided_Handlers_Should_Use_The_System_Reversal_Path_Not_Void()
    {
        var posting = Substitute.For<IVoucherPostingService>();
        var paymentId = Guid.CreateVersion7();

        await new CustomerPaymentVoidedIntegrationEventHandler(posting).HandleAsync(CustomerVoided(paymentId));
        await new SupplierPaymentVoidedIntegrationEventHandler(posting).HandleAsync(SupplierVoided(paymentId));

        await posting.Received(1).ReverseSystemVoucherAsync("CustomerPayment", paymentId, Arg.Any<string>(), VoidedAt, Arg.Any<CancellationToken>());
        await posting.Received(1).ReverseSystemVoucherAsync("SupplierPayment", paymentId, Arg.Any<string>(), VoidedAt, Arg.Any<CancellationToken>());
        await posting.DidNotReceiveWithAnyArgs().VoidAsync(Guid.Empty, default!, default);
    }
}
