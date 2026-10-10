using FSH.Modules.Reference.Domain;

namespace Reference.Tests.Domain;

public sealed class MedicineCategoryTests
{
    #region Create

    [Fact]
    public void Create_Should_TrimAndSlugify_When_Valid()
    {
        var category = MedicineCategory.Create("  Pain Relief & Fever  ", "  desc  ", null);

        category.Name.ShouldBe("Pain Relief & Fever");
        category.Slug.ShouldBe("pain-relief-fever");
        category.Description.ShouldBe("desc");
        category.ParentCategoryId.ShouldBeNull();
        category.Id.ShouldNotBe(Guid.Empty);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_Should_Throw_When_NameIsBlank(string name)
    {
        Should.Throw<ArgumentException>(() => MedicineCategory.Create(name, null, null));
    }

    #endregion

    #region Update

    [Fact]
    public void Update_Should_MutateFieldsAndRestamp_When_Valid()
    {
        var category = MedicineCategory.Create("Antibiotics", null, null);
        var parentId = Guid.CreateVersion7();

        category.Update("Antibiotics (Oral)", "oral only", parentId);

        category.Name.ShouldBe("Antibiotics (Oral)");
        category.Slug.ShouldBe("antibiotics-oral");
        category.Description.ShouldBe("oral only");
        category.ParentCategoryId.ShouldBe(parentId);
        category.UpdatedAtUtc.ShouldNotBeNull();
    }

    [Fact]
    public void Update_Should_Throw_When_ParentIsSelf()
    {
        var category = MedicineCategory.Create("Antibiotics", null, null);

        Should.Throw<InvalidOperationException>(() => category.Update("Antibiotics", null, category.Id));
    }

    #endregion

    #region Restore

    [Fact]
    public void Restore_Should_BeNoOp_When_NotDeleted()
    {
        var category = MedicineCategory.Create("Antibiotics", null, null);

        category.Restore();

        category.IsDeleted.ShouldBeFalse();
        category.UpdatedAtUtc.ShouldBeNull();
    }

    #endregion
}
