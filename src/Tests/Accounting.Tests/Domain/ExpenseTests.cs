using FSH.Modules.Accounting.Domain;

namespace Accounting.Tests.Domain;

public sealed class ExpenseTests
{
    [Fact]
    public void Create_Should_TrimFields_When_Valid()
    {
        var expense = Expense.Create(DateTime.UtcNow, "  Utilities  ", 75m, "  Cash  ", "  electricity  ", "  manager1  ");

        expense.Category.ShouldBe("Utilities");
        expense.Amount.ShouldBe(75m);
        expense.PaymentMethod.ShouldBe("Cash");
        expense.Description.ShouldBe("electricity");
        expense.RecordedBy.ShouldBe("manager1");
        expense.BranchId.ShouldBeNull();
    }

    [Fact]
    public void Create_Should_SetBranchId_When_Provided()
    {
        var branchId = Guid.CreateVersion7();
        var expense = Expense.Create(DateTime.UtcNow, "Utilities", 75m, "Cash", null, "manager1", branchId);

        expense.BranchId.ShouldBe(branchId);
    }

    [Fact]
    public void Create_Should_Throw_When_AmountNotPositive()
    {
        Should.Throw<ArgumentOutOfRangeException>(() => Expense.Create(DateTime.UtcNow, "Utilities", 0m, "Cash", null, "manager1"));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_Should_Throw_When_CategoryIsBlank(string category)
    {
        Should.Throw<ArgumentException>(() => Expense.Create(DateTime.UtcNow, category, 10m, "Cash", null, "manager1"));
    }

    [Fact]
    public void ReceiptReference_Should_BeTrimmed_And_BlankStoredAsNull()
    {
        var expense = Expense.Create(DateTime.UtcNow, "Rent", 10m, "Cash", null, "manager1", receiptReference: "  BILL-9 ");
        expense.ReceiptReference.ShouldBe("BILL-9");

        expense.Update("Rent", 12m, "Bank", null, "   ");
        expense.ReceiptReference.ShouldBeNull();

        expense.Update("Rent", 12m, "Bank", null, "BILL-10");
        expense.ReceiptReference.ShouldBe("BILL-10");
    }
}
