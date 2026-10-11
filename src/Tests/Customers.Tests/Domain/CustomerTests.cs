using FSH.Modules.Customers.Domain;

namespace Customers.Tests.Domain;

public sealed class CustomerTests
{
    #region Create

    [Fact]
    public void Create_Should_SeedOpeningBalance_And_TrimFields()
    {
        var customer = Customer.Create("  Jane Doe  ", "555", "jane@test.com", "addr", 250m);

        customer.Name.ShouldBe("Jane Doe");
        customer.CurrentBalance.ShouldBe(250m);
        customer.IsActive.ShouldBeTrue();
        customer.Id.ShouldNotBe(Guid.Empty);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_Should_Throw_When_NameIsBlank(string name)
    {
        Should.Throw<ArgumentException>(() => Customer.Create(name, null, null, null, 0m));
    }

    #endregion

    #region ApplyLedgerEntry

    [Fact]
    public void ApplyLedgerEntry_Should_IncreaseBalance_When_Debit_CreditSale()
    {
        var customer = Customer.Create("Jane", null, null, null, 0m);

        var newBalance = customer.ApplyLedgerEntry(debitAmount: 50m, creditAmount: 0m);

        newBalance.ShouldBe(50m);
    }

    [Fact]
    public void ApplyLedgerEntry_Should_DecreaseBalance_When_Credit_Payment()
    {
        var customer = Customer.Create("Jane", null, null, null, 100m);

        var newBalance = customer.ApplyLedgerEntry(debitAmount: 0m, creditAmount: 30m);

        newBalance.ShouldBe(70m);
    }

    [Fact]
    public void ApplyLedgerEntry_Should_Throw_When_AmountsNegative()
    {
        var customer = Customer.Create("Jane", null, null, null, 0m);

        Should.Throw<ArgumentOutOfRangeException>(() => customer.ApplyLedgerEntry(0m, -5m));
    }

    #endregion

    #region Restore

    [Fact]
    public void Restore_Should_BeNoOp_When_NotDeleted()
    {
        var customer = Customer.Create("Jane", null, null, null, 0m);

        customer.Restore();

        customer.IsDeleted.ShouldBeFalse();
    }

    #endregion
}
