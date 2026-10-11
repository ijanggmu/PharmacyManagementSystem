using FSH.Modules.Suppliers.Domain;

namespace Suppliers.Tests.Domain;

public sealed class SupplierTests
{
    #region Create

    [Fact]
    public void Create_Should_SeedOpeningBalance_And_TrimFields()
    {
        var supplier = Supplier.Create("  Acme Pharma  ", "Jane", "555", "jane@acme.test", "addr", "TAX1", 500m);

        supplier.Name.ShouldBe("Acme Pharma");
        supplier.CurrentBalance.ShouldBe(500m);
        supplier.IsActive.ShouldBeTrue();
        supplier.Id.ShouldNotBe(Guid.Empty);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_Should_Throw_When_NameIsBlank(string name)
    {
        Should.Throw<ArgumentException>(() => Supplier.Create(name, null, null, null, null, null, 0m));
    }

    #endregion

    #region ApplyLedgerEntry

    [Fact]
    public void ApplyLedgerEntry_Should_IncreaseBalance_When_Debit()
    {
        var supplier = Supplier.Create("Acme", null, null, null, null, null, 0m);

        var newBalance = supplier.ApplyLedgerEntry(debitAmount: 100m, creditAmount: 0m);

        newBalance.ShouldBe(100m);
        supplier.CurrentBalance.ShouldBe(100m);
    }

    [Fact]
    public void ApplyLedgerEntry_Should_DecreaseBalance_When_Credit()
    {
        var supplier = Supplier.Create("Acme", null, null, null, null, null, 100m);

        var newBalance = supplier.ApplyLedgerEntry(debitAmount: 0m, creditAmount: 40m);

        newBalance.ShouldBe(60m);
    }

    [Fact]
    public void ApplyLedgerEntry_Should_Throw_When_AmountsNegative()
    {
        var supplier = Supplier.Create("Acme", null, null, null, null, null, 0m);

        Should.Throw<ArgumentOutOfRangeException>(() => supplier.ApplyLedgerEntry(-1m, 0m));
    }

    #endregion

    #region Restore

    [Fact]
    public void Restore_Should_BeNoOp_When_NotDeleted()
    {
        var supplier = Supplier.Create("Acme", null, null, null, null, null, 0m);

        supplier.Restore();

        supplier.IsDeleted.ShouldBeFalse();
    }

    #endregion
}
