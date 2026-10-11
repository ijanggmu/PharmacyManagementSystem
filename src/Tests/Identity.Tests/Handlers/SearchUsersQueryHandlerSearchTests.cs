using FSH.Modules.Identity.Domain;
using FSH.Modules.Identity.Features.v1.Users.SearchUsers;

namespace Identity.Tests.Handlers;

/// <summary>
/// Tests for the free-text filter of <see cref="SearchUsersQueryHandler"/> (LINQ-to-objects; the
/// expression only uses ToLower/Contains, which translate the same way in Npgsql).
/// </summary>
public sealed class SearchUsersQueryHandlerSearchTests
{
    private static readonly FshUser Ram = new()
    {
        Id = "u1",
        FirstName = "Ram",
        LastName = "Sharma",
        Email = "ram@pharmacy.test",
        UserName = "ram.sharma",
    };

    private static readonly FshUser Sita = new()
    {
        Id = "u2",
        FirstName = "Sita",
        LastName = "Karki",
        Email = "sita@pharmacy.test",
        UserName = "sita",
    };

    private static readonly FshUser Hari = new()
    {
        Id = "u3",
        FirstName = "Hari",
        LastName = "Sharma",
        Email = "hari@pharmacy.test",
        UserName = "hari",
    };

    private static IQueryable<FshUser> Users() => new[] { Ram, Sita, Hari }.AsQueryable();

    private static string[] Search(string? term) =>
        SearchUsersQueryHandler.ApplySearch(Users(), term).Select(u => u.Id).ToArray();

    [Fact]
    public void ApplySearch_Should_MatchFullName_When_TermSpansFirstAndLastName()
    {
        Search("Ram Sharma").ShouldBe(new[] { "u1" });
    }

    [Fact]
    public void ApplySearch_Should_BeCaseInsensitive_And_IgnoreExtraWhitespace()
    {
        Search("  sHaRmA   hari ").ShouldBe(new[] { "u3" });
    }

    [Fact]
    public void ApplySearch_Should_MatchEmailOrUserName_When_SingleWord()
    {
        Search("sita@pharmacy").ShouldBe(new[] { "u2" });
        Search("ram.sharma").ShouldBe(new[] { "u1" });
    }

    [Fact]
    public void ApplySearch_Should_ReturnEveryMatch_When_WordIsShared()
    {
        Search("sharma").ShouldBe(new[] { "u1", "u3" });
    }

    [Fact]
    public void ApplySearch_Should_ReturnAll_When_TermIsBlank()
    {
        Search("   ").Length.ShouldBe(3);
        Search(null).Length.ShouldBe(3);
    }

    [Fact]
    public void ApplySearch_Should_ReturnNone_When_AnyWordMissing()
    {
        Search("Ram Karki").ShouldBeEmpty();
    }
}
