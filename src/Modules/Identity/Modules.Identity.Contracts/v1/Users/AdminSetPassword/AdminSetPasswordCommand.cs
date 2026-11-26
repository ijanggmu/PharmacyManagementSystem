using Mediator;

namespace FSH.Modules.Identity.Contracts.v1.Users.AdminSetPassword;

/// <summary>
/// An administrator sets a new password for another user in the current tenant (the user forgot theirs
/// and email isn't an option). The new password must meet the Identity policy, and every session the user
/// had is revoked. Gated by <c>Permissions.Users.Update</c> at the endpoint.
/// </summary>
public sealed record AdminSetPasswordCommand(string UserId, string NewPassword, string ConfirmNewPassword) : ICommand<Unit>;
