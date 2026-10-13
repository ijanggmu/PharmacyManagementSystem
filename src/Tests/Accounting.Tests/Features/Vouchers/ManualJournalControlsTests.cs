using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Vouchers;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.Vouchers.CreateManualVoucher;
using FSH.Modules.Accounting.Features.v1.Vouchers.PostVoucher;
using FSH.Modules.Accounting.Features.v1.Vouchers.UpdateVoucher;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Accounting.Tests.Features.Vouchers;

/// <summary>
/// Manual-journal controls: control accounts (AR, AP, Inventory, Input VAT, VAT Payable) are refused on
/// create, update and post; the voucher date is required and not in the future; a reversing voucher (or a
/// reversed one) can't be voided, and reversing the reversal stays the supported way back.
/// </summary>
public sealed class ManualJournalControlsTests : IDisposable
{
    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();

    public void Dispose() => _db.Dispose();

    private Task<AccountingAccount> SystemAsync(string code, AccountingAccountType type) =>
        AccountingTestChart.AddAsync(_db, code, type, isSystem: true);

    private static IReadOnlyList<VoucherLineInput> Lines(Guid debit, Guid credit) =>
    [
        new VoucherLineInput(debit, "debit", 100m, 0m),
        new VoucherLineInput(credit, "credit", 0m, 100m),
    ];

    public static TheoryData<string, AccountingAccountType, string> ControlAccounts => new()
    {
        { AccountingSystemAccountCodes.AccountsReceivable, AccountingAccountType.Asset, "customer receipts" },
        { AccountingSystemAccountCodes.AccountsPayable, AccountingAccountType.Liability, "supplier payments" },
        { AccountingSystemAccountCodes.Inventory, AccountingAccountType.Asset, "stock adjustments" },
        { AccountingSystemAccountCodes.InputVatRecoverable, AccountingAccountType.Asset, "VAT payment" },
        { AccountingSystemAccountCodes.VatPayable, AccountingAccountType.Liability, "VAT payment" },
    };

    [Theory]
    [MemberData(nameof(ControlAccounts))]
    public async Task Create_Should_Refuse_ControlAccount_NamingWhereToRecordIt(string code, AccountingAccountType type, string hint)
    {
        var control = await SystemAsync(code, type);
        var bank = await SystemAsync(AccountingSystemAccountCodes.Bank, AccountingAccountType.Asset);

        var ex = await Should.ThrowAsync<CustomException>(() => new CreateManualVoucherCommandHandler(_db, _currentBranch)
            .Handle(new CreateManualVoucherCommand(DateTime.UtcNow, "adjust", Lines(control.Id, bank.Id)), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.BadRequest);
        ex.Message.ShouldContain(code);
        ex.Message.ShouldContain(hint);
        (await _db.Vouchers.CountAsync()).ShouldBe(0);
    }

    [Fact]
    public async Task Create_Should_Allow_BankCashRevenueAndExpense()
    {
        var bank = await SystemAsync(AccountingSystemAccountCodes.Bank, AccountingAccountType.Asset);
        var cash = await SystemAsync(AccountingSystemAccountCodes.Cash, AccountingAccountType.Asset);
        var revenue = await SystemAsync(AccountingSystemAccountCodes.SalesRevenue, AccountingAccountType.Revenue);
        var expense = await SystemAsync(AccountingSystemAccountCodes.GeneralExpenses, AccountingAccountType.Expense);
        var handler = new CreateManualVoucherCommandHandler(_db, _currentBranch);

        await handler.Handle(new CreateManualVoucherCommand(DateTime.UtcNow, "a", Lines(bank.Id, revenue.Id)), CancellationToken.None);
        await handler.Handle(new CreateManualVoucherCommand(DateTime.UtcNow, "b", Lines(expense.Id, cash.Id)), CancellationToken.None);

        (await _db.Vouchers.CountAsync()).ShouldBe(2);
    }

    [Fact]
    public async Task Update_Should_Refuse_ControlAccount()
    {
        var bank = await SystemAsync(AccountingSystemAccountCodes.Bank, AccountingAccountType.Asset);
        var revenue = await SystemAsync(AccountingSystemAccountCodes.SalesRevenue, AccountingAccountType.Revenue);
        var receivable = await SystemAsync(AccountingSystemAccountCodes.AccountsReceivable, AccountingAccountType.Asset);
        var draft = await VoucherSeed.DraftAsync(_db, DateTime.UtcNow, bank.Id, revenue.Id, 100m);

        var ex = await Should.ThrowAsync<CustomException>(() => new UpdateVoucherCommandHandler(_db, _currentBranch)
            .Handle(new UpdateVoucherCommand(draft.Id, DateTime.UtcNow, "x", Lines(receivable.Id, revenue.Id)), CancellationToken.None).AsTask());

        ex.Message.ShouldContain(AccountingSystemAccountCodes.AccountsReceivable);
        _db.ChangeTracker.Clear();
        (await _db.Vouchers.Include(v => v.Lines).SingleAsync()).Lines.ShouldNotContain(l => l.AccountId == receivable.Id);
    }

    [Fact]
    public async Task Post_Should_Refuse_OldDraft_OnAControlAccount()
    {
        var inventory = await SystemAsync(AccountingSystemAccountCodes.Inventory, AccountingAccountType.Asset);
        var bank = await SystemAsync(AccountingSystemAccountCodes.Bank, AccountingAccountType.Asset);
        // Saved before the rule existed: seeded straight into the table.
        var draft = await VoucherSeed.DraftAsync(_db, DateTime.UtcNow, inventory.Id, bank.Id, 100m);
        var currentUser = Substitute.For<ICurrentUser>();
        currentUser.Name.Returns("tester");

        var handler = new PostVoucherCommandHandler(
            _db, new AccountingVoucherSequenceService(_db), new AccountingPostingLockService(_db), currentUser, _currentBranch);
        var ex = await Should.ThrowAsync<CustomException>(() => handler.Handle(new PostVoucherCommand(draft.Id), CancellationToken.None).AsTask());

        ex.Message.ShouldContain(AccountingSystemAccountCodes.Inventory);
        (await _db.Vouchers.AsNoTracking().SingleAsync()).Status.ShouldBe(AccountingVoucherStatus.Draft);
    }

    [Fact]
    public void Validators_Should_Require_A_Date_NotInTheFuture()
    {
        var lines = Lines(Guid.CreateVersion7(), Guid.CreateVersion7());
        var create = new CreateManualVoucherCommandValidator();
        var update = new UpdateVoucherCommandValidator();
        DateTime tomorrowNepal = NepalDate.StartUtc(NepalDate.FromUtc(DateTime.UtcNow).AddDays(1));
        DateTime todayNepalMidnightUtcLabel = DateTime.SpecifyKind(
            NepalDate.FromUtc(DateTime.UtcNow).ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc);

        create.Validate(new CreateManualVoucherCommand(default, "x", lines)).IsValid.ShouldBeFalse();
        create.Validate(new CreateManualVoucherCommand(tomorrowNepal, "x", lines)).IsValid.ShouldBeFalse();
        create.Validate(new CreateManualVoucherCommand(DateTime.UtcNow, "x", lines)).IsValid.ShouldBeTrue();
        // The web app sends the chosen Nepal day as "yyyy-MM-ddT00:00:00Z"; today must pass at any hour.
        create.Validate(new CreateManualVoucherCommand(todayNepalMidnightUtcLabel, "x", lines)).IsValid.ShouldBeTrue();

        update.Validate(new UpdateVoucherCommand(Guid.CreateVersion7(), default, "x", lines)).IsValid.ShouldBeFalse();
        update.Validate(new UpdateVoucherCommand(Guid.CreateVersion7(), tomorrowNepal, "x", lines)).IsValid.ShouldBeFalse();
        update.Validate(new UpdateVoucherCommand(Guid.CreateVersion7(), DateTime.UtcNow.AddDays(-3), "x", lines)).IsValid.ShouldBeTrue();
    }

    [Fact]
    public async Task Void_Should_Refuse_AReversal_And_AReversedVoucher_While_ReversingTheReversal_StillWorks()
    {
        var bank = await SystemAsync(AccountingSystemAccountCodes.Bank, AccountingAccountType.Asset);
        var revenue = await SystemAsync(AccountingSystemAccountCodes.SalesRevenue, AccountingAccountType.Revenue);
        var original = await VoucherSeed.PostedAsync(
            _db, DateTime.UtcNow.AddDays(-1), "JV-0001", bank.Id, revenue.Id, 100m, "journal", AccountingVoucherSource.Manual);
        var posting = TestVoucherPosting.Create(_db);

        Guid reversalId = await posting.ReverseAsync(original.Id, "tester");
        var reversal = await _db.Vouchers.AsNoTracking().SingleAsync(v => v.Id == reversalId);

        var voidReversal = await Should.ThrowAsync<CustomException>(async () => await posting.VoidAsync(reversalId, "oops"));
        voidReversal.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
        voidReversal.Message.ShouldContain("reverses another voucher");

        var voidOriginal = await Should.ThrowAsync<CustomException>(async () => await posting.VoidAsync(original.Id, "oops"));
        voidOriginal.Message.ShouldContain(reversal.VoucherNo);

        // The supported way back: reverse the reversal. The original stays "reversed" (Void) and the chain nets to it.
        Guid reReversalId = await posting.ReverseAsync(reversalId, "tester");
        _db.ChangeTracker.Clear();
        var statuses = await _db.Vouchers.AsNoTracking().ToDictionaryAsync(v => v.Id, v => v.Status);
        statuses[original.Id].ShouldBe(AccountingVoucherStatus.Void);
        statuses[reversalId].ShouldBe(AccountingVoucherStatus.Void);
        statuses[reReversalId].ShouldBe(AccountingVoucherStatus.Posted);
        // All three count in the ledger (LedgerVoucherQueries: posted, or void with a reversing voucher).
        var bankNet = await _db.VoucherLines
            .Where(l => l.AccountId == bank.Id)
            .SumAsync(l => l.DebitAmount - l.CreditAmount);
        bankNet.ShouldBe(100m);
    }
}
