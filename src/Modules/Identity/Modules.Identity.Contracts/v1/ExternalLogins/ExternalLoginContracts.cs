using FSH.Modules.Identity.Contracts.DTOs;
using Mediator;

namespace FSH.Modules.Identity.Contracts.v1.ExternalLogins;

/// <summary>Provider names used for external logins.</summary>
public static class ExternalLoginProviders
{
    public const string Google = "Google";
}

/// <summary>Sign in with a Google ID token into the tenant given by the <c>tenant</c> header. The Google
/// account must already be connected to a user of that tenant (no linking by email).</summary>
public sealed record GoogleTokenCommand(
    string IdToken,
    string? TwoFactorCode = null,
    string? RecoveryCode = null) : ICommand<TokenResponse>;

/// <summary>Which pharmacies a verified Google account is connected to — used to pick the tenant before
/// <see cref="GoogleTokenCommand"/>. Requires the ID token, so it can't be used to enumerate by email.</summary>
public sealed record ResolveGoogleLoginQuery(string IdToken) : IQuery<GoogleLoginResolution>;

public sealed record GoogleLoginTenant(string TenantId, string TenantName);

public sealed record GoogleLoginResolution(
    string Email,
    IReadOnlyList<GoogleLoginTenant> Tenants);

/// <summary>Verify a Google ID token for sign-up: returns the profile to prefill the form with.</summary>
public sealed record VerifyGoogleSignUpQuery(string IdToken) : IQuery<GoogleSignUpProfile>;

public sealed record GoogleSignUpProfile(string Email, string? FirstName, string? LastName, string? Picture);

/// <summary>Connect a Google account to the signed-in user.</summary>
public sealed record ConnectGoogleLoginCommand(string IdToken) : ICommand<ExternalLoginDto>;

/// <summary>Disconnect the signed-in user's Google account.</summary>
public sealed record DisconnectGoogleLoginCommand : ICommand<bool>;

/// <summary>The signed-in user's connected accounts.</summary>
public sealed record GetMyExternalLoginsQuery : IQuery<MyExternalLoginsDto>;

public sealed record ExternalLoginDto(string Provider, string? DisplayName);

/// <summary>Connected accounts. <c>HasPassword</c> is false for accounts without a password (such a user
/// can't disconnect their last login); <c>GoogleEnabled</c> says whether Google sign-in is configured.</summary>
public sealed record MyExternalLoginsDto(
    IReadOnlyList<ExternalLoginDto> Logins,
    bool HasPassword,
    bool GoogleEnabled);
