namespace FSH.Modules.Identity.Contracts.DTOs;

/// <summary>
/// The current user's two-factor state: whether it is on and how many unused recovery codes remain.
/// </summary>
public sealed record TwoFactorStatusResponse(bool Enabled, int RecoveryCodesLeft);
