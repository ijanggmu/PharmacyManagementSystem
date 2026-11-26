using FSH.Modules.Identity.Domain;

namespace Identity.Tests.Data;

public sealed class FshUserDeletionTests
{
    private static FshUser ActiveUser() => new()
    {
        Id = "6f1c1f7e-0d0e-4a7a-9c1b-2b8f7c1d3e4f",
        UserName = "ram",
        Email = "ram@example.com",
        EmailConfirmed = true,
        PhoneNumber = "9800000000",
        FirstName = "Ram",
        LastName = "Sharma",
        IsActive = true,
        RefreshToken = "token",
    };

    [Fact]
    public void MarkDeleted_Should_DeactivateAndFreeEmailAndUserName_ButKeepName()
    {
        var user = ActiveUser();
        var when = new DateTime(2026, 11, 26, 0, 0, 0, DateTimeKind.Utc);

        user.MarkDeleted("admin-1", when);

        user.IsActive.ShouldBeFalse();
        user.DeletedOnUtc.ShouldBe(when);
        user.DeletedBy.ShouldBe("admin-1");
        user.DeletedEmail.ShouldBe("ram@example.com");
        user.Email.ShouldBe($"deleted-{user.Id}@deleted.invalid");
        user.UserName.ShouldBe($"deleted-{user.Id}");
        user.EmailConfirmed.ShouldBeFalse();
        user.PhoneNumber.ShouldBeNull();
        user.RefreshToken.ShouldBeNull();
        // History keeps showing who it was.
        user.FirstName.ShouldBe("Ram");
        user.LastName.ShouldBe("Sharma");
        user.DomainEvents.ShouldNotBeEmpty();
    }

    [Fact]
    public void MarkDeleted_Should_BeIdempotent()
    {
        var user = ActiveUser();
        var first = new DateTime(2026, 11, 26, 0, 0, 0, DateTimeKind.Utc);
        user.MarkDeleted("admin-1", first);

        user.MarkDeleted("admin-2", first.AddDays(1));

        user.DeletedOnUtc.ShouldBe(first);
        user.DeletedBy.ShouldBe("admin-1");
        user.DeletedEmail.ShouldBe("ram@example.com");
    }
}
