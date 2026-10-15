using FSH.Modules.Accounting.Domain;

namespace Accounting.Tests.Domain;

public sealed class AccountingAccountTests
{
    #region Create

    [Fact]
    public void Create_Should_UppercaseCode_And_SetSystemFlag()
    {
        var account = AccountingAccount.Create("1000", "Cash", AccountingAccountType.Asset, isSystem: true);

        account.Code.ShouldBe("1000");
        account.Name.ShouldBe("Cash");
        account.AccountType.ShouldBe(AccountingAccountType.Asset);
        account.IsSystem.ShouldBeTrue();
        account.IsActive.ShouldBeTrue();
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_Should_Throw_When_CodeIsBlank(string code)
    {
        Should.Throw<ArgumentException>(() => AccountingAccount.Create(code, "Cash", AccountingAccountType.Asset));
    }

    #endregion

    #region Deactivate

    [Fact]
    public void Deactivate_Should_Throw_When_SystemAccount()
    {
        var account = AccountingAccount.Create("1000", "Cash", AccountingAccountType.Asset, isSystem: true);

        var ex = Should.Throw<FSH.Framework.Core.Exceptions.CustomException>(account.Deactivate);
        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
        ex.Message.ShouldContain("system account");
        account.IsActive.ShouldBeTrue();
    }

    [Fact]
    public void Deactivate_Should_Succeed_When_NotSystemAccount()
    {
        var account = AccountingAccount.Create("9000", "Custom", AccountingAccountType.Expense, isSystem: false);

        account.Deactivate();

        account.IsActive.ShouldBeFalse();
    }

    [Fact]
    public void Activate_Should_SetIsActiveTrue()
    {
        var account = AccountingAccount.Create("9000", "Custom", AccountingAccountType.Expense, isSystem: false);
        account.Deactivate();

        account.Activate();

        account.IsActive.ShouldBeTrue();
    }

    #endregion

    #region ChangeType

    [Fact]
    public void ChangeType_Should_MoveAccountToNewHead()
    {
        var account = AccountingAccount.Create("9000", "Custom", AccountingAccountType.Expense);

        account.ChangeType(AccountingAccountType.Asset);

        account.AccountType.ShouldBe(AccountingAccountType.Asset);
        account.UpdatedAtUtc.ShouldNotBeNull();
    }

    [Fact]
    public void ChangeType_Should_Throw_When_SystemAccount()
    {
        var account = AccountingAccount.Create("1000", "Cash", AccountingAccountType.Asset, isSystem: true);

        Should.Throw<InvalidOperationException>(() => account.ChangeType(AccountingAccountType.Expense));
        account.AccountType.ShouldBe(AccountingAccountType.Asset);
    }

    [Fact]
    public void ChangeType_Should_NotStampUpdate_When_SameHead()
    {
        var account = AccountingAccount.Create("9000", "Custom", AccountingAccountType.Expense);

        account.ChangeType(AccountingAccountType.Expense);

        account.UpdatedAtUtc.ShouldBeNull();
    }

    #endregion

    #region Hierarchy

    [Fact]
    public void CreateRootHead_Should_BeSystemRootWithTypeDigitCode()
    {
        var root = AccountingAccount.CreateRootHead(AccountingAccountType.Liability);

        root.Code.ShouldBe("2");
        root.Name.ShouldBe("Liabilities");
        root.IsSystem.ShouldBeTrue();
        root.ParentId.ShouldBeNull();
        root.IsRootHead.ShouldBeTrue();
    }

    [Fact]
    public void MoveUnder_Should_TakeParentHeadAndNewCode()
    {
        var revenue = AccountingAccount.CreateRootHead(AccountingAccountType.Revenue);
        var account = AccountingAccount.Create("5300", "Misc", AccountingAccountType.Expense);

        account.MoveUnder(revenue, "4300");

        account.ParentId.ShouldBe(revenue.Id);
        account.AccountType.ShouldBe(AccountingAccountType.Revenue);
        account.Code.ShouldBe("4300");
    }

    [Fact]
    public void MoveUnder_Should_KeepSystemCode()
    {
        var assets = AccountingAccount.CreateRootHead(AccountingAccountType.Asset);
        var group = AccountingAccount.Create("1300", "Cash & bank", AccountingAccountType.Asset, parentId: assets.Id);
        var cash = AccountingAccount.Create("1000", "Cash", AccountingAccountType.Asset, isSystem: true, parentId: assets.Id);

        cash.MoveUnder(group, "130001");

        cash.ParentId.ShouldBe(group.Id);
        cash.Code.ShouldBe("1000");
    }

    [Fact]
    public void MoveUnder_Should_Throw_When_RootHead()
    {
        var assets = AccountingAccount.CreateRootHead(AccountingAccountType.Asset);
        var other = AccountingAccount.Create("1300", "Group", AccountingAccountType.Asset, parentId: assets.Id);

        Should.Throw<InvalidOperationException>(() => assets.MoveUnder(other, null));
    }

    [Fact]
    public void AttachToRoot_Should_OnlyAttachOrphansOfSameHead()
    {
        var assets = AccountingAccount.CreateRootHead(AccountingAccountType.Asset);
        var orphan = AccountingAccount.Create("1000", "Cash", AccountingAccountType.Asset, isSystem: true);
        var expense = AccountingAccount.Create("5000", "COGS", AccountingAccountType.Expense, isSystem: true);

        orphan.AttachToRoot(assets);
        expense.AttachToRoot(assets);

        orphan.ParentId.ShouldBe(assets.Id);
        expense.ParentId.ShouldBeNull();
    }

    #endregion
}
