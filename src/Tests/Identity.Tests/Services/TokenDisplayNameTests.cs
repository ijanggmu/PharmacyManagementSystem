using FSH.Modules.Identity.Domain;
using FSH.Modules.Identity.Services;

namespace Identity.Tests.Services;

/// <summary>The token's name claim feeds every "posted by / closed by" field: the full name, not the first name.</summary>
public sealed class TokenDisplayNameTests
{
    [Theory]
    [InlineData("Sita", "Sharma", "sita", "sita@p.test", "Sita Sharma")]
    [InlineData(" Sita ", " Sharma ", "sita", "sita@p.test", "Sita Sharma")]
    [InlineData("Sita", null, "sita", "sita@p.test", "Sita")]
    [InlineData(null, null, "sita", "sita@p.test", "sita")]
    [InlineData("", " ", null, "sita@p.test", "sita@p.test")]
    public void DisplayNameOf_Should_Use_FullName_ThenUserName_ThenEmail(
        string? first, string? last, string? userName, string? email, string expected)
    {
        var user = new FshUser { FirstName = first!, LastName = last!, UserName = userName, Email = email };

        IdentityService.DisplayNameOf(user).ShouldBe(expected);
    }
}
