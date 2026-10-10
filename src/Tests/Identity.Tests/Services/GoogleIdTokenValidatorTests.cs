using System.Security.Claims;
using System.Security.Cryptography;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Identity.Services.Google;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using NSubstitute;

namespace Identity.Tests.Services;

/// <summary>Google ID tokens are checked for signature, issuer, audience, lifetime — with our own RSA key
/// standing in for Google's published keys.</summary>
public sealed class GoogleIdTokenValidatorTests : IDisposable
{
    private const string ClientId = "client-123.apps.googleusercontent.com";

    private readonly RSA _rsa = RSA.Create(2048);
    private readonly RsaSecurityKey _key;

    public GoogleIdTokenValidatorTests()
    {
        _key = new RsaSecurityKey(_rsa) { KeyId = "test-key" };
    }

    public void Dispose() => _rsa.Dispose();

    private GoogleIdTokenValidator CreateValidator(params string[] clientIds)
    {
        var keys = Substitute.For<IGoogleSigningKeyProvider>();
        keys.GetSigningKeysAsync(Arg.Any<CancellationToken>()).Returns([_key]);
        return new GoogleIdTokenValidator(
            Options.Create(new GoogleAuthOptions { ClientIds = clientIds }),
            keys,
            TimeProvider.System,
            NullLogger<GoogleIdTokenValidator>.Instance);
    }

    private string CreateToken(
        string audience = ClientId,
        string issuer = "https://accounts.google.com",
        DateTime? expires = null,
        bool emailVerified = true,
        SecurityKey? signingKey = null)
    {
        var now = DateTime.UtcNow;
        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = issuer,
            Audience = audience,
            IssuedAt = now.AddMinutes(-1),
            NotBefore = now.AddMinutes(-1),
            Expires = expires ?? now.AddMinutes(30),
            Subject = new ClaimsIdentity(
            [
                new Claim("sub", "google-sub-1"),
                new Claim("email", "owner@sunrise.com"),
                new Claim("given_name", "Asha"),
                new Claim("family_name", "Rai"),
            ]),
            Claims = new Dictionary<string, object> { ["email_verified"] = emailVerified },
            SigningCredentials = new SigningCredentials(signingKey ?? _key, SecurityAlgorithms.RsaSha256),
        };
        return new JsonWebTokenHandler().CreateToken(descriptor);
    }

    [Fact]
    public async Task ValidateAsync_Should_ReturnIdentity_When_TokenIsValid()
    {
        var identity = await CreateValidator(ClientId).ValidateAsync(CreateToken());

        identity.Subject.ShouldBe("google-sub-1");
        identity.Email.ShouldBe("owner@sunrise.com");
        identity.EmailVerified.ShouldBeTrue();
        identity.GivenName.ShouldBe("Asha");
        identity.FamilyName.ShouldBe("Rai");
    }

    [Fact]
    public async Task ValidateAsync_Should_AcceptIssuerWithoutScheme()
    {
        var identity = await CreateValidator(ClientId).ValidateAsync(CreateToken(issuer: "accounts.google.com"));

        identity.Subject.ShouldBe("google-sub-1");
    }

    [Fact]
    public async Task ValidateAsync_Should_ReportUnverifiedEmail()
    {
        var identity = await CreateValidator(ClientId).ValidateAsync(CreateToken(emailVerified: false));

        identity.EmailVerified.ShouldBeFalse();
    }

    [Fact]
    public async Task ValidateAsync_Should_Reject_TokenForAnotherClient()
    {
        await Should.ThrowAsync<UnauthorizedException>(
            () => CreateValidator(ClientId).ValidateAsync(CreateToken(audience: "someone-else")));
    }

    [Fact]
    public async Task ValidateAsync_Should_Reject_ForeignIssuer()
    {
        await Should.ThrowAsync<UnauthorizedException>(
            () => CreateValidator(ClientId).ValidateAsync(CreateToken(issuer: "https://evil.example.com")));
    }

    [Fact]
    public async Task ValidateAsync_Should_Reject_ExpiredToken()
    {
        await Should.ThrowAsync<UnauthorizedException>(
            () => CreateValidator(ClientId).ValidateAsync(CreateToken(expires: DateTime.UtcNow.AddMinutes(-30))));
    }

    [Fact]
    public async Task ValidateAsync_Should_Reject_TokenSignedWithAnotherKey()
    {
        using var other = RSA.Create(2048);
        var token = CreateToken(signingKey: new RsaSecurityKey(other) { KeyId = "test-key" });

        await Should.ThrowAsync<UnauthorizedException>(() => CreateValidator(ClientId).ValidateAsync(token));
    }

    [Fact]
    public async Task ValidateAsync_Should_Reject_Garbage()
    {
        await Should.ThrowAsync<UnauthorizedException>(() => CreateValidator(ClientId).ValidateAsync("not-a-jwt"));
    }

    [Fact]
    public async Task ValidateAsync_Should_ThrowNotFound_When_NotConfigured()
    {
        var validator = CreateValidator();

        validator.IsEnabled.ShouldBeFalse();
        await Should.ThrowAsync<NotFoundException>(() => validator.ValidateAsync(CreateToken()));
    }
}
