using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Cheques;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.Cheques;
using FSH.Modules.Accounting.Features.v1.Cheques.BounceCheque;
using FSH.Modules.Accounting.Features.v1.Cheques.CancelCheque;
using FSH.Modules.Accounting.Features.v1.Cheques.ClearCheque;
using FSH.Modules.Accounting.Features.v1.Cheques.DepositCheque;
using FSH.Modules.Accounting.Features.v1.Cheques.GetChequeStatusForPayment;
using FSH.Modules.Accounting.Features.v1.Cheques.SearchCheques;
using FSH.Modules.Accounting.IntegrationEventHandlers;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Customers.Contracts.Events;
using FSH.Modules.Customers.Contracts.v1.Ledger;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.Authorization;
using FSH.Modules.Suppliers.Contracts.Events;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using FluentValidation.TestHelper;
using Mediator;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Accounting.Tests.Features.Cheques;

/// <summary>
/// The cheque register end to end over a real voucher posting service and chart: post-dated cheques received / issued
/// park in Cheques in Hand (1160) / Cheques Issued (2160), clearing moves them to the bank with a contra voucher, a
/// bounce voids the payment through the party's void path (so AR/AP subledger and GL stay reconciled), and a cheque
/// posted straight to the bank only changes status.
/// </summary>
public sealed class ChequeRegisterTests : IDisposable
{
    private static readonly DateTime Paid = new(2026, 5, 1, 6, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime ChequeDate = new(2026, 5, 20, 0, 0, 0, DateTimeKind.Utc);
    private static readonly Guid BranchId = Guid.CreateVersion7();
    private const decimal Invoice = 8000m;

    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();
    private readonly ICurrentUser _user = Substitute.For<ICurrentUser>();
    private readonly ICurrentBranch _branch = Substitute.For<ICurrentBranch>();
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly IUserPermissionService _permissions = Substitute.For<IUserPermissionService>();
    private readonly TimeProvider _clock = new FixedClock(new DateTime(2026, 6, 1, 6, 0, 0, DateTimeKind.Utc));
    private readonly Guid _customerId = Guid.CreateVersion7();
    private readonly Guid _supplierId = Guid.CreateVersion7();

    private AccountingAccount _bank = default!;
    private AccountingAccount _receivable = default!;
    private AccountingAccount _payable = default!;
    private AccountingAccount _sales = default!;

    public ChequeRegisterTests()
    {
        _user.Name.Returns("accountant1");
        _user.GetUserId().Returns(Guid.CreateVersion7());
        _branch.CanViewAllBranchesAsync(Arg.Any<CancellationToken>()).Returns(true);
        _permissions.HasPermissionAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(true);
        _mediator.Send(Arg.Any<VoidCustomerPaymentCommand>(), Arg.Any<CancellationToken>()).Returns(Guid.CreateVersion7());
        _mediator.Send(Arg.Any<VoidSupplierPaymentCommand>(), Arg.Any<CancellationToken>()).Returns(Guid.CreateVersion7());
    }

    public void Dispose() => _db.Dispose();

    private sealed class FixedClock(DateTime utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(utcNow, TimeSpan.Zero);
    }

    private VoucherPostingService Posting() => TestVoucherPosting.Create(_db, _branch);

    private IPaymentMethodAccountResolver PaymentAccounts() => TestPaymentAccounts.For(new AccountingAccountResolver(_db), _db);

    /// <summary>The chart without 1160/2160: they are created on first use, like a tenant seeded before the register.</summary>
    private async Task ChartAsync()
    {
        await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.Cash, AccountingAccountType.Asset, isSystem: true);
        _bank = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.Bank, AccountingAccountType.Asset, isSystem: true);
        _receivable = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.AccountsReceivable, AccountingAccountType.Asset, isSystem: true);
        _payable = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.AccountsPayable, AccountingAccountType.Liability, isSystem: true);
        _sales = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.SalesRevenue, AccountingAccountType.Revenue, isSystem: true);
        await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.Inventory, AccountingAccountType.Asset, isSystem: true);
        await AccountingTestChart.RootAsync(_db, AccountingAccountType.Expense);
        await AccountingTestChart.RootAsync(_db, AccountingAccountType.Equity);
    }

    /// <summary>A credit sale the customer then pays by cheque (Dr AR / Cr Sales), so AR has a balance to reconcile.</summary>
    private async Task CreditSaleAsync()
    {
        await Posting().PostSystemVoucherAsync(new PostVoucherRequest(
            "system_sale", "Sale", Guid.CreateVersion7(), "credit sale",
            [
                new PostVoucherLine(_receivable.Id, "on account", Invoice, 0m),
                new PostVoucherLine(_sales.Id, "sales", 0m, Invoice),
            ],
            BranchId, Paid.AddDays(-10)));
    }

    private async Task<Guid> ReceiveChequeAsync(decimal amount = 5000m, bool clearedOnDeposit = false, Guid? paymentId = null)
    {
        var id = paymentId ?? Guid.CreateVersion7();
        await new CustomerPaymentRecordedIntegrationEventHandler(Posting(), new AccountingAccountResolver(_db), PaymentAccounts(), _db)
            .HandleAsync(ReceiptEvent(id, amount, clearedOnDeposit));
        return id;
    }

    private CustomerPaymentRecordedIntegrationEvent ReceiptEvent(Guid paymentId, decimal amount, bool clearedOnDeposit = false) =>
        new(Guid.NewGuid(), Paid, "t", "c", "Customers", paymentId, _customerId, "Himal Pharma", amount, "RCP-1",
            BranchId: BranchId, PaymentMethod: "cheque", PaymentDateUtc: Paid,
            ChequeNumber: "004512", ChequeDateUtc: ChequeDate, ChequeBank: "Nabil Bank", ChequeClearedOnDeposit: clearedOnDeposit);

    private async Task<Guid> IssueChequeAsync(decimal amount = 9000m, decimal tds = 0m)
    {
        var id = Guid.CreateVersion7();
        await new SupplierPaymentRecordedIntegrationEventHandler(Posting(), new AccountingAccountResolver(_db), PaymentAccounts(), _db)
            .HandleAsync(new SupplierPaymentRecordedIntegrationEvent(
                Guid.NewGuid(), Paid, "t", "c", "Suppliers", id, _supplierId, "Deurali Janta", amount, null,
                BranchId: BranchId, PaymentMethod: "cheque", PaymentDateUtc: Paid,
                TdsAmount: tds, TdsCategory: tds > 0m ? "service_vat" : null,
                ChequeNumber: "000777", ChequeDateUtc: ChequeDate, ChequeBank: "Global IME"));
        return id;
    }

    private Task<Cheque> ChequeForAsync(Guid paymentId) =>
        _db.Cheques.Include(c => c.History).SingleAsync(c => c.PaymentReferenceId == paymentId);

    private async Task<decimal> BalanceAsync(string code)
    {
        var id = await _db.Accounts.Where(a => a.Code == code).Select(a => a.Id).SingleAsync();
        var lines = await (from l in _db.VoucherLines
                           join v in _db.Vouchers on l.VoucherId equals v.Id
                           where l.AccountId == id && v.Status != AccountingVoucherStatus.Draft
                           select new { l.DebitAmount, l.CreditAmount }).ToListAsync();
        return lines.Sum(l => l.DebitAmount - l.CreditAmount);
    }

    private ClearChequeCommandHandler ClearHandler() =>
        new(_db, Posting(), PaymentAccounts(), new AccountingPostingLockService(_db), _user, _branch);

    private BounceChequeCommandHandler BounceHandler() => new(_db, _mediator, Posting(), _user, _branch, _permissions, _clock);

    private CancelChequeCommandHandler CancelHandler() => new(_db, _mediator, _user, _branch, _permissions, _clock);

    private async Task AssertAllVouchersBalanceAsync()
    {
        foreach (var voucher in await _db.Vouchers.Include(v => v.Lines).ToListAsync())
        {
            voucher.Lines.Sum(l => l.DebitAmount).ShouldBe(voucher.Lines.Sum(l => l.CreditAmount), voucher.VoucherNo);
        }
    }

    #region Received

    [Fact]
    public async Task PostDated_Receipt_Should_Post_To_Cheques_In_Hand_And_Register_The_Cheque()
    {
        await ChartAsync();
        var paymentId = await ReceiveChequeAsync();

        var voucher = await _db.Vouchers.Include(v => v.Lines).SingleAsync(v => v.ReferenceType == "CustomerPayment");
        var inHand = await _db.Accounts.SingleAsync(a => a.Code == AccountingSystemAccountCodes.ChequesInHand);
        inHand.IsSystem.ShouldBeTrue("created on first use as a system account");
        inHand.AccountType.ShouldBe(AccountingAccountType.Asset);
        voucher.Lines.Single(l => l.AccountId == inHand.Id).DebitAmount.ShouldBe(5000m);
        voucher.Lines.Single(l => l.AccountId == _receivable.Id).CreditAmount.ShouldBe(5000m);
        voucher.Lines.ShouldNotContain(l => l.AccountId == _bank.Id, "a post-dated cheque is not money in the bank");

        var cheque = await ChequeForAsync(paymentId);
        cheque.Direction.ShouldBe(ChequeDirection.Received);
        cheque.Status.ShouldBe(ChequeStatus.OnHand);
        cheque.PostedToBank.ShouldBeFalse();
        cheque.ChequeNumber.ShouldBe("004512");
        cheque.ChequeDateUtc.ShouldBe(ChequeDate);
        cheque.BankName.ShouldBe("Nabil Bank");
        cheque.PartyId.ShouldBe(_customerId);
        cheque.History.Count.ShouldBe(1);
    }

    [Fact]
    public async Task Redelivered_Receipt_Should_Not_Register_The_Cheque_Twice()
    {
        await ChartAsync();
        var paymentId = Guid.CreateVersion7();
        var evt = ReceiptEvent(paymentId, 5000m);
        var handler = new CustomerPaymentRecordedIntegrationEventHandler(Posting(), new AccountingAccountResolver(_db), PaymentAccounts(), _db);

        await handler.HandleAsync(evt);
        await handler.HandleAsync(evt);

        (await _db.Cheques.CountAsync()).ShouldBe(1);
        (await _db.Vouchers.CountAsync(v => v.ReferenceType == "CustomerPayment")).ShouldBe(1);
    }

    [Fact]
    public async Task Cheque_Receipt_Without_A_Number_Should_Post_To_The_Bank_As_Before()
    {
        await ChartAsync();
        await new CustomerPaymentRecordedIntegrationEventHandler(Posting(), new AccountingAccountResolver(_db), PaymentAccounts(), _db)
            .HandleAsync(new CustomerPaymentRecordedIntegrationEvent(
                Guid.NewGuid(), Paid, "t", "c", "Customers", Guid.CreateVersion7(), _customerId, "Ram", 300m, null,
                PaymentMethod: "cheque", PaymentDateUtc: Paid));

        (await BalanceAsync(AccountingSystemAccountCodes.Bank)).ShouldBe(300m);
        (await _db.Cheques.AnyAsync()).ShouldBeFalse();
    }

    [Fact]
    public async Task Cleared_On_Deposit_Receipt_Should_Post_To_The_Bank_And_Clear_Without_A_Voucher()
    {
        await ChartAsync();
        var paymentId = await ReceiveChequeAsync(clearedOnDeposit: true);

        (await BalanceAsync(AccountingSystemAccountCodes.Bank)).ShouldBe(5000m);
        var cheque = await ChequeForAsync(paymentId);
        cheque.PostedToBank.ShouldBeTrue();
        cheque.Status.ShouldBe(ChequeStatus.Deposited);

        var dto = await ClearHandler().Handle(new ClearChequeCommand(cheque.Id, ChequeDate), CancellationToken.None);

        dto.Status.ShouldBe(ChequeValues.StatusCleared);
        (await _db.Vouchers.CountAsync()).ShouldBe(1, "nothing moves: the money was posted to the bank with the receipt");
        (await BalanceAsync(AccountingSystemAccountCodes.Bank)).ShouldBe(5000m);
    }

    [Fact]
    public async Task Deposit_Then_Clear_Should_Move_The_Amount_From_Cheques_In_Hand_To_The_Bank()
    {
        await ChartAsync();
        var paymentId = await ReceiveChequeAsync();
        var cheque = await ChequeForAsync(paymentId);

        var deposited = await new DepositChequeCommandHandler(_db, _user, _branch)
            .Handle(new DepositChequeCommand(cheque.Id, ChequeDate, _bank.Id, "slip 55"), CancellationToken.None);
        deposited.Status.ShouldBe(ChequeValues.StatusDeposited);
        (await _db.Vouchers.CountAsync()).ShouldBe(1, "a deposit posts nothing");

        var cleared = await ClearHandler().Handle(new ClearChequeCommand(cheque.Id, ChequeDate.AddDays(2)), CancellationToken.None);

        cleared.Status.ShouldBe(ChequeValues.StatusCleared);
        cleared.ClearedDateUtc.ShouldBe(ChequeDate.AddDays(2));
        var clearance = await _db.Vouchers.Include(v => v.Lines).SingleAsync(v => v.ReferenceType == ClearChequeCommandHandler.ReferenceType);
        clearance.VoucherType.ShouldBe("system_cheque_clearance");
        clearance.VoucherDateUtc.ShouldBe(ChequeDate.AddDays(2));
        clearance.Lines.Single(l => l.AccountId == _bank.Id).DebitAmount.ShouldBe(5000m);
        cleared.History![^1].VoucherId.ShouldBe(clearance.Id);

        (await BalanceAsync(AccountingSystemAccountCodes.ChequesInHand)).ShouldBe(0m);
        (await BalanceAsync(AccountingSystemAccountCodes.Bank)).ShouldBe(5000m);
        await AssertAllVouchersBalanceAsync();
    }

    [Fact]
    public async Task Clearing_Before_The_Cheque_Date_Should_Be_Refused()
    {
        await ChartAsync();
        var cheque = await ChequeForAsync(await ReceiveChequeAsync());

        var ex = await Should.ThrowAsync<CustomException>(() =>
            ClearHandler().Handle(new ClearChequeCommand(cheque.Id, ChequeDate.AddDays(-3)), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await _db.Vouchers.CountAsync()).ShouldBe(1);
    }

    [Fact]
    public async Task Clearing_In_A_Locked_Period_Should_Be_Refused()
    {
        await ChartAsync();
        var cheque = await ChequeForAsync(await ReceiveChequeAsync());
        var lockRow = await new AccountingPostingLockService(_db).GetOrCreateAsync();
        lockRow.SetLockDate(new DateOnly(2026, 5, 31), "auditor");
        await _db.SaveChangesAsync();

        await Should.ThrowAsync<CustomException>(() =>
            ClearHandler().Handle(new ClearChequeCommand(cheque.Id, ChequeDate.AddDays(1)), CancellationToken.None).AsTask());

        (await _db.Cheques.AsNoTracking().SingleAsync()).Status.ShouldBe(ChequeStatus.OnHand);
    }

    [Fact]
    public async Task Bounced_Receipt_Should_Void_The_Payment_And_Leave_AR_Subledger_And_GL_Reconciled()
    {
        await ChartAsync();
        await CreditSaleAsync();
        var paymentId = await ReceiveChequeAsync(5000m);
        var cheque = await ChequeForAsync(paymentId);
        await new DepositChequeCommandHandler(_db, _user, _branch)
            .Handle(new DepositChequeCommand(cheque.Id, ChequeDate), CancellationToken.None);

        // The customer's AR subledger: the sale, the payment, and (below) the void's reversing debit.
        decimal subledger = Invoice - 5000m;
        (await BalanceAsync(AccountingSystemAccountCodes.AccountsReceivable)).ShouldBe(subledger);

        var dto = await BounceHandler().Handle(new BounceChequeCommand(cheque.Id, "insufficient funds"), CancellationToken.None);

        dto.Status.ShouldBe(ChequeValues.StatusBounced);
        await _mediator.Received(1).Send(
            Arg.Is<VoidCustomerPaymentCommand>(c =>
                c.CustomerId == _customerId && c.PaymentId == paymentId && c.Reason.Contains("004512") && c.Reason.Contains("insufficient funds")),
            Arg.Any<CancellationToken>());
        await _permissions.Received(1).HasPermissionAsync(Arg.Any<string>(), CustomersPermissions.Ledger.VoidPayment, Arg.Any<CancellationToken>());

        // Customers commits the void and raises the event; Accounting's handlers then reverse the receipt voucher.
        subledger += 5000m;
        var voided = new CustomerPaymentVoidedIntegrationEvent(
            Guid.NewGuid(), _clock.GetUtcNow().UtcDateTime, "t", "c", "Customers", paymentId, Guid.CreateVersion7(), _customerId,
            "Himal Pharma", 5000m, "Cheque 004512 bounced: insufficient funds", _clock.GetUtcNow().UtcDateTime, "RCP-1", BranchId);
        await new CustomerPaymentVoidedIntegrationEventHandler(Posting()).HandleAsync(voided);
        await new ChequePaymentVoidedIntegrationEventHandler(_db).HandleAsync(voided);

        (await BalanceAsync(AccountingSystemAccountCodes.AccountsReceivable)).ShouldBe(subledger, "AR GL matches the customer's subledger again");
        (await BalanceAsync(AccountingSystemAccountCodes.AccountsReceivable)).ShouldBe(Invoice);
        (await BalanceAsync(AccountingSystemAccountCodes.ChequesInHand)).ShouldBe(0m);
        (await BalanceAsync(AccountingSystemAccountCodes.Bank)).ShouldBe(0m);
        (await _db.Cheques.AsNoTracking().SingleAsync()).Status.ShouldBe(ChequeStatus.Bounced, "the register's own bounce is not overwritten");
        await AssertAllVouchersBalanceAsync();
    }

    [Fact]
    public async Task Bounce_Without_The_Void_Payment_Permission_Should_Be_Forbidden_And_Change_Nothing()
    {
        await ChartAsync();
        var cheque = await ChequeForAsync(await ReceiveChequeAsync());
        _permissions.HasPermissionAsync(Arg.Any<string>(), CustomersPermissions.Ledger.VoidPayment, Arg.Any<CancellationToken>()).Returns(false);

        await Should.ThrowAsync<ForbiddenException>(() =>
            BounceHandler().Handle(new BounceChequeCommand(cheque.Id, "insufficient funds"), CancellationToken.None).AsTask());

        await _mediator.DidNotReceive().Send(Arg.Any<VoidCustomerPaymentCommand>(), Arg.Any<CancellationToken>());
        (await _db.Cheques.AsNoTracking().SingleAsync()).Status.ShouldBe(ChequeStatus.OnHand);
    }

    [Fact]
    public async Task A_Cleared_Cheque_Should_Not_Be_Cancelled()
    {
        await ChartAsync();
        var cheque = await ChequeForAsync(await ReceiveChequeAsync());
        await ClearHandler().Handle(new ClearChequeCommand(cheque.Id, ChequeDate), CancellationToken.None);

        var cancel = await Should.ThrowAsync<CustomException>(() =>
            CancelHandler().Handle(new CancelChequeCommand(cheque.Id, "returned"), CancellationToken.None).AsTask());

        cancel.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        await _mediator.DidNotReceive().Send(Arg.Any<VoidCustomerPaymentCommand>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task A_Cleared_Receipt_Cheque_That_Bounces_Should_Reverse_The_Clearance_And_Void_Through_The_Register_Bypass()
    {
        await ChartAsync();
        await CreditSaleAsync();
        var paymentId = await ReceiveChequeAsync(5000m);
        var cheque = await ChequeForAsync(paymentId);
        await ClearHandler().Handle(new ClearChequeCommand(cheque.Id, ChequeDate), CancellationToken.None);
        (await BalanceAsync(AccountingSystemAccountCodes.Bank)).ShouldBe(5000m);

        var dto = await BounceHandler().Handle(new BounceChequeCommand(cheque.Id, "returned after clearing"), CancellationToken.None);

        dto.Status.ShouldBe(ChequeValues.StatusBounced);
        await _mediator.Received(1).Send(
            Arg.Is<VoidCustomerPaymentCommand>(c => c.PaymentId == paymentId && c.BouncedFromChequeRegister),
            Arg.Any<CancellationToken>());
        var clearance = await _db.Vouchers.SingleAsync(v => v.ReferenceType == ClearChequeCommandHandler.ReferenceType);
        dto.History![^1].VoucherId.ShouldNotBeNull();
        dto.History![^1].VoucherId.ShouldNotBe(clearance.Id, "the bounce attaches the clearance's reversing voucher");

        // Customers commits the void; Accounting reverses the receipt voucher off its event.
        var voided = new CustomerPaymentVoidedIntegrationEvent(
            Guid.NewGuid(), _clock.GetUtcNow().UtcDateTime, "t", "c", "Customers", paymentId, Guid.CreateVersion7(), _customerId,
            "Himal Pharma", 5000m, "Cheque 004512 bounced: returned after clearing", _clock.GetUtcNow().UtcDateTime, "RCP-1", BranchId);
        await new CustomerPaymentVoidedIntegrationEventHandler(Posting()).HandleAsync(voided);
        await new ChequePaymentVoidedIntegrationEventHandler(_db).HandleAsync(voided);

        (await BalanceAsync(AccountingSystemAccountCodes.ChequesInHand)).ShouldBe(0m, "the clearance reversal keeps Cheques in Hand at zero");
        (await BalanceAsync(AccountingSystemAccountCodes.Bank)).ShouldBe(0m);
        (await BalanceAsync(AccountingSystemAccountCodes.AccountsReceivable)).ShouldBe(Invoice);
        (await _db.Cheques.AsNoTracking().SingleAsync()).Status.ShouldBe(ChequeStatus.Bounced);
        await AssertAllVouchersBalanceAsync();
    }

    [Fact]
    public async Task A_Cleared_On_Deposit_Cheque_That_Bounces_Should_Not_Post_A_Clearance_Reversal()
    {
        await ChartAsync();
        var paymentId = await ReceiveChequeAsync(5000m, clearedOnDeposit: true);
        var cheque = await ChequeForAsync(paymentId);
        await ClearHandler().Handle(new ClearChequeCommand(cheque.Id, ChequeDate), CancellationToken.None);
        int vouchers = await _db.Vouchers.CountAsync();

        var dto = await BounceHandler().Handle(new BounceChequeCommand(cheque.Id, "returned"), CancellationToken.None);

        dto.Status.ShouldBe(ChequeValues.StatusBounced);
        (await _db.Vouchers.CountAsync()).ShouldBe(vouchers, "the receipt went to the bank; its own reversal is enough");
        await _mediator.Received(1).Send(
            Arg.Is<VoidCustomerPaymentCommand>(c => c.PaymentId == paymentId && c.BouncedFromChequeRegister),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task A_Cleared_Supplier_Cheque_That_Bounces_Should_Reverse_The_Clearance()
    {
        await ChartAsync();
        var paymentId = await IssueChequeAsync(9000m);
        var cheque = await ChequeForAsync(paymentId);
        await ClearHandler().Handle(new ClearChequeCommand(cheque.Id, ChequeDate), CancellationToken.None);

        await BounceHandler().Handle(new BounceChequeCommand(cheque.Id, "stopped"), CancellationToken.None);

        var voided = new SupplierPaymentVoidedIntegrationEvent(
            Guid.NewGuid(), Paid, "t", "c", "Suppliers", paymentId, Guid.CreateVersion7(), _supplierId, "Deurali Janta", 9000m,
            "Cheque 000777 bounced: stopped", _clock.GetUtcNow().UtcDateTime, BranchId);
        await new SupplierPaymentVoidedIntegrationEventHandler(Posting()).HandleAsync(voided);

        (await BalanceAsync(AccountingSystemAccountCodes.ChequesIssued)).ShouldBe(0m);
        (await BalanceAsync(AccountingSystemAccountCodes.Bank)).ShouldBe(0m);
        (await BalanceAsync(AccountingSystemAccountCodes.AccountsPayable)).ShouldBe(0m);
        await AssertAllVouchersBalanceAsync();
    }

    [Fact]
    public async Task A_Failed_Void_Should_Leave_A_Cleared_Cheque_And_Its_Clearance_Untouched()
    {
        await ChartAsync();
        var cheque = await ChequeForAsync(await ReceiveChequeAsync());
        await ClearHandler().Handle(new ClearChequeCommand(cheque.Id, ChequeDate), CancellationToken.None);
        _mediator.Send(Arg.Any<VoidCustomerPaymentCommand>(), Arg.Any<CancellationToken>())
            .Returns<Guid>(_ => throw new CustomException("already voided", (IEnumerable<string>?)null, HttpStatusCode.Conflict));

        await Should.ThrowAsync<CustomException>(() =>
            BounceHandler().Handle(new BounceChequeCommand(cheque.Id, "returned"), CancellationToken.None).AsTask());

        (await _db.Cheques.AsNoTracking().SingleAsync()).Status.ShouldBe(ChequeStatus.Cleared);
        (await BalanceAsync(AccountingSystemAccountCodes.Bank)).ShouldBe(5000m);
    }

    [Fact]
    public async Task Cheque_Status_For_Payment_Should_Report_Cleared_Only_After_Clearance()
    {
        await ChartAsync();
        var paymentId = await ReceiveChequeAsync();
        var cheque = await ChequeForAsync(paymentId);
        var handler = new GetChequeStatusForPaymentQueryHandler(_db);

        var before = await handler.Handle(new GetChequeStatusForPaymentQuery(ChequePaymentReferenceTypes.CustomerPayment, paymentId), CancellationToken.None);
        before.ShouldNotBeNull();
        before.IsCleared.ShouldBeFalse();
        before.Status.ShouldBe(ChequeValues.StatusOnHand);
        before.ChequeNumber.ShouldBe("004512");

        await ClearHandler().Handle(new ClearChequeCommand(cheque.Id, ChequeDate), CancellationToken.None);
        var after = await handler.Handle(new GetChequeStatusForPaymentQuery(ChequePaymentReferenceTypes.CustomerPayment, paymentId), CancellationToken.None);
        after!.IsCleared.ShouldBeTrue();

        (await handler.Handle(new GetChequeStatusForPaymentQuery(ChequePaymentReferenceTypes.SupplierPayment, paymentId), CancellationToken.None))
            .ShouldBeNull("the reference type must match");
        (await handler.Handle(new GetChequeStatusForPaymentQuery(ChequePaymentReferenceTypes.CustomerPayment, Guid.CreateVersion7()), CancellationToken.None))
            .ShouldBeNull();
    }

    [Fact]
    public async Task A_Deposited_Cheque_Should_Not_Be_Cancelled()
    {
        await ChartAsync();
        var cheque = await ChequeForAsync(await ReceiveChequeAsync());
        await new DepositChequeCommandHandler(_db, _user, _branch).Handle(new DepositChequeCommand(cheque.Id, ChequeDate), CancellationToken.None);

        var ex = await Should.ThrowAsync<CustomException>(() =>
            CancelHandler().Handle(new CancelChequeCommand(cheque.Id, "customer asked"), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        await _mediator.DidNotReceive().Send(Arg.Any<VoidCustomerPaymentCommand>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Cancelling_A_Cheque_On_Hand_Should_Void_The_Payment()
    {
        await ChartAsync();
        var paymentId = await ReceiveChequeAsync();
        var cheque = await ChequeForAsync(paymentId);

        var dto = await CancelHandler().Handle(new CancelChequeCommand(cheque.Id, "returned to customer"), CancellationToken.None);

        dto.Status.ShouldBe(ChequeValues.StatusCancelled);
        await _mediator.Received(1).Send(Arg.Is<VoidCustomerPaymentCommand>(c => c.PaymentId == paymentId), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Payment_Voided_From_The_Ledger_Should_Cancel_A_Cheque_Still_In_Play()
    {
        await ChartAsync();
        var paymentId = await ReceiveChequeAsync();

        await new ChequePaymentVoidedIntegrationEventHandler(_db).HandleAsync(new CustomerPaymentVoidedIntegrationEvent(
            Guid.NewGuid(), Paid, "t", "c", "Customers", paymentId, Guid.CreateVersion7(), _customerId, "Himal Pharma", 5000m,
            "keyed twice", Paid.AddDays(1)));

        var cheque = await ChequeForAsync(paymentId);
        cheque.Status.ShouldBe(ChequeStatus.Cancelled);
        cheque.History[^1].Note!.ShouldContain("keyed twice");
    }

    #endregion

    #region Issued

    [Fact]
    public async Task PostDated_Supplier_Payment_Should_Credit_Cheques_Issued_Net_Of_Tds_And_Clear_From_The_Bank()
    {
        await ChartAsync();
        var paymentId = await IssueChequeAsync(9000m, tds: 135m);

        var issuedAccount = await _db.Accounts.SingleAsync(a => a.Code == AccountingSystemAccountCodes.ChequesIssued);
        issuedAccount.AccountType.ShouldBe(AccountingAccountType.Liability);
        var payment = await _db.Vouchers.Include(v => v.Lines).SingleAsync(v => v.ReferenceType == "SupplierPayment");
        payment.Lines.Single(l => l.AccountId == _payable.Id).DebitAmount.ShouldBe(9000m);
        payment.Lines.Single(l => l.AccountId == issuedAccount.Id).CreditAmount.ShouldBe(8865m);
        payment.Lines.ShouldNotContain(l => l.AccountId == _bank.Id);

        var cheque = await ChequeForAsync(paymentId);
        cheque.Direction.ShouldBe(ChequeDirection.Issued);
        cheque.Status.ShouldBe(ChequeStatus.Issued);
        cheque.Amount.ShouldBe(8865m, "the cheque is for the money paid out");

        var presented = await new DepositChequeCommandHandler(_db, _user, _branch)
            .Handle(new DepositChequeCommand(cheque.Id, ChequeDate), CancellationToken.None);
        presented.Status.ShouldBe(ChequeValues.StatusPresented);

        await ClearHandler().Handle(new ClearChequeCommand(cheque.Id, ChequeDate.AddDays(1)), CancellationToken.None);

        (await BalanceAsync(AccountingSystemAccountCodes.ChequesIssued)).ShouldBe(0m);
        (await BalanceAsync(AccountingSystemAccountCodes.Bank)).ShouldBe(-8865m);
        await AssertAllVouchersBalanceAsync();
    }

    [Fact]
    public async Task Bounced_Supplier_Cheque_Should_Void_The_Payment_And_Reopen_AP()
    {
        await ChartAsync();
        var paymentId = await IssueChequeAsync(9000m);
        var cheque = await ChequeForAsync(paymentId);
        (await BalanceAsync(AccountingSystemAccountCodes.AccountsPayable)).ShouldBe(9000m);

        await BounceHandler().Handle(new BounceChequeCommand(cheque.Id, "signature mismatch"), CancellationToken.None);

        await _mediator.Received(1).Send(
            Arg.Is<VoidSupplierPaymentCommand>(c => c.SupplierId == _supplierId && c.PaymentId == paymentId),
            Arg.Any<CancellationToken>());
        await _permissions.Received(1).HasPermissionAsync(Arg.Any<string>(), SuppliersPermissions.Ledger.VoidPayment, Arg.Any<CancellationToken>());

        var voided = new SupplierPaymentVoidedIntegrationEvent(
            Guid.NewGuid(), Paid, "t", "c", "Suppliers", paymentId, Guid.CreateVersion7(), _supplierId, "Deurali Janta", 9000m,
            "Cheque 000777 bounced: signature mismatch", _clock.GetUtcNow().UtcDateTime, BranchId);
        await new SupplierPaymentVoidedIntegrationEventHandler(Posting()).HandleAsync(voided);
        await new ChequePaymentVoidedIntegrationEventHandler(_db).HandleAsync(voided);

        // Dr AP 9000 at payment, reversed: the supplier is owed again (AP back to its pre-payment credit balance of 0 here),
        // and nothing is left in Cheques Issued.
        (await BalanceAsync(AccountingSystemAccountCodes.AccountsPayable)).ShouldBe(0m);
        (await BalanceAsync(AccountingSystemAccountCodes.ChequesIssued)).ShouldBe(0m);
        (await _db.Cheques.AsNoTracking().SingleAsync()).Status.ShouldBe(ChequeStatus.Bounced);
    }

    #endregion

    #region Register

    [Fact]
    public async Task Search_DueOnly_Should_List_Cheques_In_Play_Dated_Today_Or_Earlier()
    {
        await ChartAsync();
        await ReceiveChequeAsync();                                   // dated 20 May: due on 1 June
        var clearedId = await ReceiveChequeAsync(100m);               // cleared below: not due
        var cleared = await ChequeForAsync(clearedId);
        await ClearHandler().Handle(new ClearChequeCommand(cleared.Id, ChequeDate), CancellationToken.None);
        await IssueChequeAsync();                                     // issued, dated 20 May: due

        var handler = new SearchChequesQueryHandler(_db, _branch, _clock);
        var due = await handler.Handle(new SearchChequesQuery(DueOnly: true), CancellationToken.None);
        due.Items.Count.ShouldBe(2);
        due.Items.ShouldAllBe(c => c.Status != ChequeValues.StatusCleared);

        var notYet = await handler.Handle(new SearchChequesQuery(DueOnly: true, AsOfUtc: ChequeDate.AddDays(-2)), CancellationToken.None);
        notYet.Items.ShouldBeEmpty();

        var received = await handler.Handle(new SearchChequesQuery(Direction: "received", Status: "cleared"), CancellationToken.None);
        received.Items.Single().Id.ShouldBe(cleared.Id);

        var byNumber = await handler.Handle(new SearchChequesQuery(Search: "777"), CancellationToken.None);
        byNumber.Items.Single().Direction.ShouldBe(ChequeValues.Issued);

        var single = await new GetChequeByIdQueryHandler(_db, _branch).Handle(new GetChequeByIdQuery(cleared.Id), CancellationToken.None);
        single.History!.Count.ShouldBe(2);
    }

    [Fact]
    public void VoucherSeries_Should_Number_Cheque_Clearances_As_Contra()
    {
        VoucherSeries.ForVoucherType(ClearChequeCommandHandler.VoucherType).ShouldBe(VoucherSeries.Contra);
    }

    [Fact]
    public void Cheque_Accounts_Should_Be_Control_Accounts_Outside_The_Cash_Bank_Block()
    {
        AccountingControlAccounts.IsControlAccount(AccountingSystemAccountCodes.ChequesInHand, isSystem: true).ShouldBeTrue();
        AccountingControlAccounts.IsControlAccount(AccountingSystemAccountCodes.ChequesIssued, isSystem: true).ShouldBeTrue();
        AccountingSystemAccountCodes.ChequesInHand.ShouldNotStartWith("10", Case.Sensitive, "a cheque in hand is not money in the bank (10xx is cash & bank)");
    }

    [Fact]
    public void Validators_Should_Check_Dates_And_Reasons()
    {
        var id = Guid.CreateVersion7();
        new ClearChequeCommandValidator().TestValidate(new ClearChequeCommand(id, default)).ShouldHaveValidationErrorFor(x => x.ClearedDateUtc);
        new ClearChequeCommandValidator().TestValidate(new ClearChequeCommand(id, DateTime.UtcNow.AddDays(5))).ShouldHaveValidationErrorFor(x => x.ClearedDateUtc);
        new ClearChequeCommandValidator().TestValidate(new ClearChequeCommand(id, DateTime.UtcNow, Guid.Empty)).ShouldHaveValidationErrorFor(x => x.BankAccountId);
        new DepositChequeCommandValidator().TestValidate(new DepositChequeCommand(Guid.Empty, DateTime.UtcNow)).ShouldHaveValidationErrorFor(x => x.ChequeId);
        new BounceChequeCommandValidator().TestValidate(new BounceChequeCommand(id, " x ")).ShouldHaveValidationErrorFor(x => x.Reason);
        new CancelChequeCommandValidator().TestValidate(new CancelChequeCommand(id, "")).ShouldHaveValidationErrorFor(x => x.Reason);
        new BounceChequeCommandValidator().TestValidate(new BounceChequeCommand(id, "insufficient funds")).IsValid.ShouldBeTrue();
        new SearchChequesQueryValidator().TestValidate(new SearchChequesQuery(Status: "lost")).ShouldHaveValidationErrorFor(x => x.Status);
        new SearchChequesQueryValidator().TestValidate(new SearchChequesQuery(Status: "On_Hand", Direction: "Received")).IsValid.ShouldBeTrue();
    }

    #endregion
}
