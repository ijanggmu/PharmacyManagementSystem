using FSH.Framework.Web.Origin;
using FSH.Modules.Identity.Features.v1.Users;

namespace Identity.Tests.Services;

public sealed class WebAppOriginTests
{
    [Theory]
    [InlineData("https://app.example.com", "https://app.example.com")]
    [InlineData("https://app.example.com/", "https://app.example.com")]
    [InlineData("https://app.example.com/base/", "https://app.example.com/base")]
    public void Resolve_Should_ReturnConfiguredOrigin_WithoutTrailingSlash(string configured, string expected)
    {
        WebAppOrigin.Resolve(new OriginOptions { OriginUrl = new Uri(configured) }).ShouldBe(expected);
    }

    [Fact]
    public void Resolve_Should_Throw_When_OriginIsNotConfigured()
    {
        Should.Throw<InvalidOperationException>(() => WebAppOrigin.Resolve(new OriginOptions()));
        Should.Throw<InvalidOperationException>(() => WebAppOrigin.Resolve(null));
    }
}
