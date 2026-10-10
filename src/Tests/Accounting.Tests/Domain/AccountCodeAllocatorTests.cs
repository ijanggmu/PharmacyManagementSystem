using FSH.Modules.Accounting.Domain;

namespace Accounting.Tests.Domain;

public sealed class AccountCodeAllocatorTests
{
    private static readonly AccountingAccount Assets = AccountingAccount.CreateRootHead(AccountingAccountType.Asset);

    [Fact]
    public void UnderRoot_Should_TakeNextHundred_AfterHighestCodeInHeadBlock()
    {
        var taken = new HashSet<string> { "1", "1000", "1010", "1100", "1150", "1200", "2000" };

        AccountCodeAllocator.NextChildCode(Assets, taken).ShouldBe("1300");
        AccountCodeAllocator.NextChildCode(Assets, taken).ShouldBe("1400");
    }

    [Fact]
    public void UnderRoot_Should_StartAtBlockBase_When_HeadEmpty()
    {
        var expenses = AccountingAccount.CreateRootHead(AccountingAccountType.Expense);

        AccountCodeAllocator.NextChildCode(expenses, new HashSet<string> { "5" }).ShouldBe("5000");
    }

    [Fact]
    public void UnderRoot_Should_FallBackToFreeTens_When_HundredsExhausted()
    {
        var taken = new HashSet<string> { "1900" };
        for (int n = 1000; n <= 1900; n += 100)
        {
            taken.Add(n.ToString(System.Globalization.CultureInfo.InvariantCulture));
        }

        AccountCodeAllocator.NextChildCode(Assets, taken).ShouldBe("1010");
    }

    [Fact]
    public void UnderAccount_Should_AppendTwoDigitSequence()
    {
        var cash = AccountingAccount.Create("1300", "Cash & bank", AccountingAccountType.Asset, parentId: Assets.Id);
        var taken = new HashSet<string> { "1300" };

        AccountCodeAllocator.NextChildCode(cash, taken).ShouldBe("130001");
        AccountCodeAllocator.NextChildCode(cash, taken).ShouldBe("130002");
    }

    [Fact]
    public void UnderAccount_Should_ContinueAfterHighestSibling_And_IgnoreDeeperCodes()
    {
        var cash = AccountingAccount.Create("1300", "Cash & bank", AccountingAccountType.Asset, parentId: Assets.Id);
        var taken = new HashSet<string> { "1300", "130001", "130007", "13000101" };

        AccountCodeAllocator.NextChildCode(cash, taken).ShouldBe("130008");
    }

    [Fact]
    public void UnderAccount_Should_ReuseGap_After99()
    {
        var parent = AccountingAccount.Create("1300", "Group", AccountingAccountType.Asset, parentId: Assets.Id);
        var taken = new HashSet<string> { "1300", "130099", "130001" };

        AccountCodeAllocator.NextChildCode(parent, taken).ShouldBe("130002");
    }
}
