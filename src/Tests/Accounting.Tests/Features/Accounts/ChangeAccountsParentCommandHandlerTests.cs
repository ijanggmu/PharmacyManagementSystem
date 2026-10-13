using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.v1.Accounts;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.Accounts.ChangeAccountsParent;
using Microsoft.EntityFrameworkCore;

namespace Accounting.Tests.Features.Accounts;

public sealed class ChangeAccountsParentCommandHandlerTests : IDisposable
{
    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();

    private Task<int> MoveAsync(Guid target, params Guid[] ids) =>
        new ChangeAccountsParentCommandHandler(_db).Handle(new ChangeAccountsParentCommand(ids, target), CancellationToken.None).AsTask();

    private async Task<AccountingAccount> ReloadAsync(Guid id) => await _db.Accounts.AsNoTracking().SingleAsync(a => a.Id == id);

    [Fact]
    public async Task Handle_Should_MoveMultipleUnderGroup_And_RecodeFromParent()
    {
        var group = await AccountingTestChart.AddAsync(_db, "1300", AccountingAccountType.Asset);
        var a = await AccountingTestChart.AddAsync(_db, "1400", AccountingAccountType.Asset);
        var b = await AccountingTestChart.AddAsync(_db, "1500", AccountingAccountType.Asset);

        var moved = await MoveAsync(group.Id, a.Id, b.Id);

        moved.ShouldBe(2);
        (await ReloadAsync(a.Id)).ShouldSatisfyAllConditions(x => x.ParentId.ShouldBe(group.Id), x => x.Code.ShouldBe("130001"));
        (await ReloadAsync(b.Id)).Code.ShouldBe("130002");
    }

    [Fact]
    public async Task Handle_Should_CarrySubtree_And_RecodeDescendants()
    {
        var target = await AccountingTestChart.AddAsync(_db, "1300", AccountingAccountType.Asset);
        var group = await AccountingTestChart.AddAsync(_db, "1400", AccountingAccountType.Asset);
        var child = await AccountingTestChart.AddAsync(_db, "140001", AccountingAccountType.Asset, group);

        await MoveAsync(target.Id, group.Id);

        (await ReloadAsync(group.Id)).Code.ShouldBe("130001");
        var movedChild = await ReloadAsync(child.Id);
        movedChild.ParentId.ShouldBe(group.Id);
        movedChild.Code.ShouldBe("13000101");
    }

    [Fact]
    public async Task Handle_Should_KeepSystemCode_When_MovedWithinHead()
    {
        var group = await AccountingTestChart.AddAsync(_db, "1300", AccountingAccountType.Asset);
        var cash = await AccountingTestChart.AddAsync(_db, "1000", AccountingAccountType.Asset, isSystem: true);

        await MoveAsync(group.Id, cash.Id);

        var moved = await ReloadAsync(cash.Id);
        moved.ParentId.ShouldBe(group.Id);
        moved.Code.ShouldBe("1000");
    }

    [Fact]
    public async Task Handle_Should_ChangeHead_When_MovedUnderAnotherRoot()
    {
        var expenses = await AccountingTestChart.RootAsync(_db, AccountingAccountType.Expense);
        var misc = await AccountingTestChart.AddAsync(_db, "1400", AccountingAccountType.Asset);

        await MoveAsync(expenses.Id, misc.Id);

        var moved = await ReloadAsync(misc.Id);
        moved.AccountType.ShouldBe(AccountingAccountType.Expense);
        moved.Code.ShouldBe("5000");
    }

    [Fact]
    public async Task Handle_Should_RejectWholeBatch_When_SystemAccountWouldChangeHead()
    {
        var liabilities = await AccountingTestChart.RootAsync(_db, AccountingAccountType.Liability);
        var custom = await AccountingTestChart.AddAsync(_db, "1400", AccountingAccountType.Asset);
        var cash = await AccountingTestChart.AddAsync(_db, "1000", AccountingAccountType.Asset, isSystem: true);

        var ex = await Should.ThrowAsync<CustomException>(() => MoveAsync(liabilities.Id, custom.Id, cash.Id));

        ex.Message.ShouldContain("1000");
        (await ReloadAsync(custom.Id)).Code.ShouldBe("1400");
    }

    [Fact]
    public async Task Handle_Should_Reject_MovingIntoOwnSubtree()
    {
        var group = await AccountingTestChart.AddAsync(_db, "1300", AccountingAccountType.Asset);
        var child = await AccountingTestChart.AddAsync(_db, "130001", AccountingAccountType.Asset, group);

        var ex = await Should.ThrowAsync<CustomException>(() => MoveAsync(child.Id, group.Id));

        ex.Message.ShouldContain("can't be the destination");
    }

    [Fact]
    public async Task Handle_Should_Reject_SystemLedgerTarget()
    {
        var cash = await AccountingTestChart.AddAsync(_db, "1000", AccountingAccountType.Asset, isSystem: true);
        var custom = await AccountingTestChart.AddAsync(_db, "1400", AccountingAccountType.Asset);

        await Should.ThrowAsync<CustomException>(() => MoveAsync(cash.Id, custom.Id));
    }

    [Fact]
    public async Task Handle_Should_RefuseHeadChange_When_AccountOrSubtreeHasPostedLines()
    {
        var expenses = await AccountingTestChart.RootAsync(_db, AccountingAccountType.Expense);
        var group = await AccountingTestChart.AddAsync(_db, "1400", AccountingAccountType.Asset);
        var child = await AccountingTestChart.AddAsync(_db, "140001", AccountingAccountType.Asset, group);
        var bank = await AccountingTestChart.AddAsync(_db, "1010", AccountingAccountType.Asset);
        await VoucherSeed.PostedAsync(_db, DateTime.UtcNow, "JV-0001", child.Id, bank.Id, 100m, "journal", AccountingVoucherSource.Manual);

        var ex = await Should.ThrowAsync<CustomException>(() => MoveAsync(expenses.Id, group.Id));

        ex.Message.ShouldContain("140001");
        ex.Message.ShouldContain("posted entries");
        (await ReloadAsync(child.Id)).AccountType.ShouldBe(AccountingAccountType.Asset);
        (await ReloadAsync(group.Id)).ParentId.ShouldNotBe(expenses.Id);
    }

    [Fact]
    public async Task Handle_Should_AllowMoveWithinSameHead_When_AccountHasPostedLines()
    {
        var target = await AccountingTestChart.AddAsync(_db, "1300", AccountingAccountType.Asset);
        var misc = await AccountingTestChart.AddAsync(_db, "1400", AccountingAccountType.Asset);
        var bank = await AccountingTestChart.AddAsync(_db, "1010", AccountingAccountType.Asset);
        await VoucherSeed.PostedAsync(_db, DateTime.UtcNow, "JV-0001", misc.Id, bank.Id, 100m, "journal", AccountingVoucherSource.Manual);

        (await MoveAsync(target.Id, misc.Id)).ShouldBe(1);

        (await ReloadAsync(misc.Id)).ParentId.ShouldBe(target.Id);
    }

    [Fact]
    public async Task Handle_Should_AllowHeadChange_When_OnlyDraftLinesExist()
    {
        var expenses = await AccountingTestChart.RootAsync(_db, AccountingAccountType.Expense);
        var misc = await AccountingTestChart.AddAsync(_db, "1400", AccountingAccountType.Asset);
        var bank = await AccountingTestChart.AddAsync(_db, "1010", AccountingAccountType.Asset);
        await VoucherSeed.DraftAsync(_db, DateTime.UtcNow, misc.Id, bank.Id, 100m);

        await MoveAsync(expenses.Id, misc.Id);

        (await ReloadAsync(misc.Id)).AccountType.ShouldBe(AccountingAccountType.Expense);
    }

    [Fact]
    public async Task Handle_Should_Reject_RootHeadSelection()
    {
        var assets = await AccountingTestChart.RootAsync(_db, AccountingAccountType.Asset);
        var group = await AccountingTestChart.AddAsync(_db, "1300", AccountingAccountType.Asset);

        await Should.ThrowAsync<CustomException>(() => MoveAsync(group.Id, assets.Id));
    }

    [Fact]
    public async Task Handle_Should_Throw_When_AccountMissing()
    {
        var group = await AccountingTestChart.AddAsync(_db, "1300", AccountingAccountType.Asset);

        await Should.ThrowAsync<NotFoundException>(() => MoveAsync(group.Id, Guid.CreateVersion7()));
    }

    [Fact]
    public void Validator_Should_Reject_EmptySelection_And_MissingTarget()
    {
        var result = new ChangeAccountsParentCommandValidator().Validate(new ChangeAccountsParentCommand([], Guid.Empty));

        result.Errors.Select(e => e.PropertyName).ShouldBe(["AccountIds", "TargetParentId"], ignoreOrder: true);
    }

    public void Dispose() => _db.Dispose();
}
