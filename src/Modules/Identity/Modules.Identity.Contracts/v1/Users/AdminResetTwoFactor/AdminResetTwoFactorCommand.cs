using Mediator;

namespace FSH.Modules.Identity.Contracts.v1.Users.AdminResetTwoFactor;

/// <summary>
/// Administratively turns off two-factor authentication for a user in the current tenant: disables
/// 2FA, rotates the authenticator key, clears recovery codes and revokes the user's sessions. Used
/// when a user has lost both their authenticator and their recovery codes. Gated by
/// <c>Permissions.Users.ResetTwoFactor</c> at the endpoint.
/// </summary>
public sealed record AdminResetTwoFactorCommand(string UserId) : ICommand<Unit>;
