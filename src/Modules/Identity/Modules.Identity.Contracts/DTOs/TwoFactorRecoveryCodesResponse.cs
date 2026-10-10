namespace FSH.Modules.Identity.Contracts.DTOs;

/// <summary>
/// A newly generated set of one-time recovery codes. Generating a set invalidates every earlier code.
/// </summary>
public sealed record TwoFactorRecoveryCodesResponse(IReadOnlyList<string> RecoveryCodes);
