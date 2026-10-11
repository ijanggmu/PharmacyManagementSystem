using FSH.Modules.Inventory.Domain;

namespace Inventory.Tests.Domain;

public sealed class MedicineTests
{
    #region Create

    [Fact]
    public void Create_Should_TrimFields_When_Valid()
    {
        var medicine = Medicine.Create("  Amoxicillin  ", "  amoxicillin  ", null, 10m, isControlled: true);

        medicine.Name.ShouldBe("Amoxicillin");
        medicine.GenericName.ShouldBe("amoxicillin");
        medicine.ReorderLevel.ShouldBe(10m);
        medicine.IsControlled.ShouldBeTrue();
    }

    [Fact]
    public void Create_Should_DefaultIsControlled_ToFalse()
    {
        var medicine = Medicine.Create("Paracetamol", null, null, 5m);

        medicine.IsControlled.ShouldBeFalse();
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_Should_Throw_When_NameIsBlank(string name)
    {
        Should.Throw<ArgumentException>(() => Medicine.Create(name, null, null, 0m));
    }

    [Fact]
    public void Create_Should_Throw_When_ReorderLevelNegative()
    {
        Should.Throw<ArgumentOutOfRangeException>(() => Medicine.Create("Paracetamol", null, null, -1m));
    }

    #endregion

    #region Update

    [Fact]
    public void Update_Should_MutateFields_When_Valid()
    {
        var medicine = Medicine.Create("Paracetamol", null, null, 5m);
        var categoryId = Guid.CreateVersion7();

        medicine.Update("Paracetamol 500mg", "acetaminophen", categoryId, 20m, isControlled: true);

        medicine.Name.ShouldBe("Paracetamol 500mg");
        medicine.CategoryId.ShouldBe(categoryId);
        medicine.ReorderLevel.ShouldBe(20m);
        medicine.IsControlled.ShouldBeTrue();
        medicine.UpdatedAtUtc.ShouldNotBeNull();
    }

    #endregion
}
