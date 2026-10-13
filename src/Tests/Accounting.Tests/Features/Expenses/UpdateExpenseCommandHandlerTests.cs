using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Expenses;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.Expenses.UpdateExpense;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Accounting.Tests.Features.Expenses;

/// <summary>
/// Editing an expense reverses its voucher at the expense's ORIGINAL date and posts the replacement at the
/// (possibly new) expense date, so the expense's period shows only the updated figure — never both.
/// </summary>
public sealed class UpdateExpenseCommandHandlerTests : IDisposable
{
    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();
    private readonly ICurrentUser _user = Substitute.For<ICurrentUser>();
    private readonly ICurrentBranch _branch = Substitute.For<ICurrentBranch>();
    private readonly IAccountingAccountResolver _resolver = Substitute.For<IAccountingAccountResolver>();
    private Guid _expensesAccountId;

    public UpdateExpenseCommandHandlerTests()
    {
        _user.Name.Returns("manager1");
        _branch.CanViewAllBranchesAsync(Arg.Any<CancellationToken>()).Returns(true);
    }

    public void Dispose() => _db.Dispose();

    private async Task<Expense> SeedExpenseAsync(DateTime dateUtc)
    {
        var expenses = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.GeneralExpenses, AccountingAccountType.Expense, isSystem: true);
        var cash = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.Cash, AccountingAccountType.Asset, isSystem: true);
        _expensesAccountId = expenses.Id;
        _resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.GeneralExpenses, Arg.Any<CancellationToken>()).Returns(expenses.Id);
        _resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Cash, Arg.Any<CancellationToken>()).Returns(cash.Id);

        var expense = Expense.Create(dateUtc, "Rent", 100m, "cash", null, "tester");
        _db.Expenses.Add(expense);
        await _db.SaveChangesAsync();
        await TestVoucherPosting.Create(_db).PostSystemVoucherAsync(new PostVoucherRequest(
            "system_expense", "Expense", expense.Id, "Rent",
            [new PostVoucherLine(expenses.Id, "Rent", 100m, 0m), new PostVoucherLine(cash.Id, "paid", 0m, 100m)],
            VoucherDateUtc: dateUtc));
        return expense;
    }

    private UpdateExpenseCommandHandler Sut() =>
        new(_db, TestVoucherPosting.Create(_db), _resolver, _user, _branch, new AccountingPostingLockService(_db), Substitute.For<Mediator.IMediator>());

    private async Task LockAsync(DateOnly lockDate)
    {
        var lockRow = await new AccountingPostingLockService(_db).GetOrCreateAsync();
        lockRow.SetLockDate(lockDate, "tester");
        await _db.SaveChangesAsync();
    }

    [Fact]
    public async Task Update_Should_Reverse_AtTheOriginalDate_And_Repost_AtTheExpenseDate()
    {
        var expenseDate = new DateTime(2026, 5, 10, 0, 0, 0, DateTimeKind.Utc);
        var expense = await SeedExpenseAsync(expenseDate);

        await Sut().Handle(new UpdateExpenseCommand(expense.Id, "Rent", 120m, "cash"), CancellationToken.None);

        var vouchers = await _db.Vouchers.Include(v => v.Lines).ToListAsync();
        vouchers.Count.ShouldBe(3);
        var original = vouchers.Single(v => v.Status == AccountingVoucherStatus.Void);
        var reversal = vouchers.Single(v => v.ReversesVoucherId == original.Id);
        var replacement = vouchers.Single(v => v.ReferenceType == "Expense" && v.Status == AccountingVoucherStatus.Posted);
        reversal.VoucherDateUtc.ShouldBe(expenseDate);
        replacement.VoucherDateUtc.ShouldBe(expenseDate);
        replacement.Lines.Sum(l => l.DebitAmount).ShouldBe(120m);

        // In the expense's own period the net expense is the updated amount only.
        decimal net = vouchers.SelectMany(v => v.Lines).Where(l => l.AccountId == _expensesAccountId).Sum(l => l.DebitAmount - l.CreditAmount);
        net.ShouldBe(120m);
    }

    [Fact]
    public async Task Update_Should_MoveTheReplacement_ToTheNewDate()
    {
        var expenseDate = new DateTime(2026, 5, 10, 0, 0, 0, DateTimeKind.Utc);
        var newDate = new DateTime(2026, 5, 20, 0, 0, 0, DateTimeKind.Utc);
        var expense = await SeedExpenseAsync(expenseDate);

        await Sut().Handle(new UpdateExpenseCommand(expense.Id, "Rent", 100m, "cash", ExpenseDateUtc: newDate), CancellationToken.None);

        var vouchers = await _db.Vouchers.ToListAsync();
        var original = vouchers.Single(v => v.Status == AccountingVoucherStatus.Void);
        vouchers.Single(v => v.ReversesVoucherId == original.Id).VoucherDateUtc.ShouldBe(expenseDate);
        vouchers.Single(v => v.ReferenceType == "Expense" && v.Status == AccountingVoucherStatus.Posted).VoucherDateUtc.ShouldBe(newDate);
        (await _db.Expenses.SingleAsync()).ExpenseDateUtc.ShouldBe(newDate);
    }

    [Fact]
    public async Task Update_Should_ReverseInTheOpenPeriod_When_TheOriginalDateIsLocked()
    {
        var expenseDate = new DateTime(2026, 5, 10, 0, 0, 0, DateTimeKind.Utc);
        var expense = await SeedExpenseAsync(expenseDate);
        await LockAsync(new DateOnly(2026, 5, 31));

        await Sut().Handle(new UpdateExpenseCommand(expense.Id, "Rent", 120m, "cash"), CancellationToken.None);

        var original = await _db.Vouchers.SingleAsync(v => v.Status == AccountingVoucherStatus.Void);
        original.VoucherDateUtc.ShouldBe(expenseDate);
        var reversal = await _db.Vouchers.SingleAsync(v => v.ReversesVoucherId == original.Id);
        NepalDate.FromUtc(reversal.VoucherDateUtc).ShouldBeGreaterThan(new DateOnly(2026, 5, 31));
    }

    [Fact]
    public async Task Update_Should_Refuse_MovingTheExpense_IntoALockedPeriod()
    {
        var expense = await SeedExpenseAsync(new DateTime(2026, 6, 10, 0, 0, 0, DateTimeKind.Utc));
        await LockAsync(new DateOnly(2026, 5, 31));

        await Should.ThrowAsync<CustomException>(() => Sut().Handle(
            new UpdateExpenseCommand(expense.Id, "Rent", 100m, "cash", ExpenseDateUtc: new DateTime(2026, 5, 20, 0, 0, 0, DateTimeKind.Utc)),
            CancellationToken.None).AsTask());
        (await _db.Vouchers.CountAsync()).ShouldBe(1);
    }
}
