using FSH.Modules.Identity.Contracts.v1.ExternalLogins;
using Mediator;

namespace FSH.Modules.Identity.Contracts.v1.Tokens.ResolvePasswordLogin;

/// <summary>
/// Which pharmacies an email + password signs in to, so a user can sign in without typing a pharmacy code.
/// Lists only the pharmacies where the password is correct: a wrong password returns an empty list (and
/// counts toward the lockout) exactly like an unknown email, so it can't be used to look up accounts.
/// </summary>
public sealed record ResolvePasswordLoginQuery(string Email, string Password) : IQuery<PasswordLoginResolution>;

/// <summary>The pharmacies the credentials are valid in (same shape as the Google sign-in's list).</summary>
public sealed record PasswordLoginResolution(IReadOnlyList<GoogleLoginTenant> Tenants);
