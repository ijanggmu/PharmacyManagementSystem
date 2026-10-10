using FSH.Modules.Inventory.Domain;

namespace Inventory.Tests.Domain;

public sealed class NepalMedicineCatalogEntryTests
{
    [Fact]
    public void Create_Should_TrimBrandName_When_Valid()
    {
        var entry = NepalMedicineCatalogEntry.Create("  Napa  ", "  Paracetamol  ", "Tablet", "500mg");

        entry.BrandName.ShouldBe("Napa");
        entry.GenericName.ShouldBe("Paracetamol");
        entry.Form.ShouldBe("Tablet");
        entry.Strength.ShouldBe("500mg");
        entry.PrescriptionRequired.ShouldBeFalse();
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_Should_Throw_When_BrandNameIsBlank(string brandName)
    {
        Should.Throw<ArgumentException>(() => NepalMedicineCatalogEntry.Create(brandName));
    }
}
