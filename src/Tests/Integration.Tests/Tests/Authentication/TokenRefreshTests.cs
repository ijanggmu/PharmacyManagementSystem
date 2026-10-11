using Integration.Tests.Infrastructure;

namespace Integration.Tests.Tests.Authentication;

[Collection(FshCollectionDefinition.Name)]
public sealed class TokenRefreshTests
{
    private readonly FshWebApplicationFactory _factory;
    private readonly AuthHelper _auth;

    public TokenRefreshTests(FshWebApplicationFactory factory)
    {
        _factory = factory;
        _auth = new AuthHelper(factory);
    }

    [Fact]
    public async Task RefreshToken_Should_ReturnNewTokenPair_When_RefreshTokenIsValid()
    {
        // Arrange
        var originalToken = await _auth.GetRootAdminTokenAsync();
        using var client = _factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Post, $"{TestConstants.IdentityBasePath}/token/refresh");
        request.Headers.Add("tenant", TestConstants.RootTenantId);
        request.Content = JsonContent.Create(new
        {
            token = originalToken.AccessToken,
            refreshToken = originalToken.RefreshToken
        });

        // Act
        var response = await client.SendAsync(request);

        // Assert
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var newToken = await response.Content.ReadFromJsonAsync<TokenRefreshResult>();
        newToken.ShouldNotBeNull();
        newToken.Token.ShouldNotBeNullOrWhiteSpace();
        newToken.RefreshToken.ShouldNotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task RefreshToken_Should_ReturnUnauthorized_When_RefreshTokenIsInvalid()
    {
        // Arrange
        var originalToken = await _auth.GetRootAdminTokenAsync();
        using var client = _factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Post, $"{TestConstants.IdentityBasePath}/token/refresh");
        request.Headers.Add("tenant", TestConstants.RootTenantId);
        request.Content = JsonContent.Create(new
        {
            token = originalToken.AccessToken,
            refreshToken = "invalid-refresh-token"
        });

        // Act
        var response = await client.SendAsync(request);

        // Assert
        response.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }

    private async Task<HttpResponseMessage> RefreshAsync(string accessToken, string refreshToken)
    {
        using var client = _factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{TestConstants.IdentityBasePath}/token/refresh");
        request.Headers.Add("tenant", TestConstants.RootTenantId);
        request.Content = JsonContent.Create(new { token = accessToken, refreshToken });
        return await client.SendAsync(request);
    }

    [Fact]
    public async Task RefreshToken_Should_Keep_Working_On_First_Device_After_Second_Device_Signs_In()
    {
        // Device A signs in, then device B signs in as the same user. The per-user column only holds
        // B's token, but A's session still owns A's token — A must not be logged out.
        var deviceA = await _auth.GetRootAdminTokenAsync();
        _ = await _auth.GetRootAdminTokenAsync();

        using var response = await RefreshAsync(deviceA.AccessToken, deviceA.RefreshToken);

        response.StatusCode.ShouldBe(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
    }
}
