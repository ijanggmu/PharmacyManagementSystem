using FSH.Modules.Identity.Contracts.DTOs;
using Mediator;

namespace FSH.Modules.Identity.Contracts.v1.TwoFactor;

/// <summary>
/// Replace the current user's recovery codes with a new set. Requires two-factor to be enabled and the
/// current password as confirmation. Every previously issued recovery code stops working.
/// </summary>
public sealed record RegenerateRecoveryCodesCommand(string CurrentPassword) : ICommand<TwoFactorRecoveryCodesResponse>;
