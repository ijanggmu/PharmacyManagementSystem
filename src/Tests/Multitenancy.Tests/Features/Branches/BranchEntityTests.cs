using FSH.Modules.Multitenancy.Domain;

namespace Multitenancy.Tests.Features.Branches;

public sealed class BranchEntityTests
{
    [Fact]
    public void Create_Should_InitializeExpectedState()
    {
        // Act
        var branch = Branch.Create("tenant-a", "Main Branch", "MAIN", "creator-1");

        // Assert
        branch.Id.ShouldNotBe(Guid.Empty);
        branch.TenantId.ShouldBe("tenant-a");
        branch.Name.ShouldBe("Main Branch");
        branch.Code.ShouldBe("MAIN");
        branch.IsActive.ShouldBeTrue();
        branch.CreatedBy.ShouldBe("creator-1");
        branch.LastModifiedOnUtc.ShouldBeNull();
    }

    [Fact]
    public void Update_Should_ChangeFieldsAndStampModification()
    {
        // Arrange
        var branch = Branch.Create("tenant-a", "Main Branch", "MAIN");

        // Act
        branch.Update("Renamed", "NEW", false, "modifier-1");

        // Assert
        branch.Name.ShouldBe("Renamed");
        branch.Code.ShouldBe("NEW");
        branch.IsActive.ShouldBeFalse();
        branch.LastModifiedBy.ShouldBe("modifier-1");
        branch.LastModifiedOnUtc.ShouldNotBeNull();
    }

    [Theory]
    [InlineData("")]
    [InlineData(" ")]
    public void Create_Should_Throw_When_NameIsInvalid(string name)
    {
        Should.Throw<ArgumentException>(() => Branch.Create("tenant-a", name, "MAIN"));
    }
}
