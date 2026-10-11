namespace FSH.Modules.Identity.Contracts.DTOs;

/// <summary>
/// Returned from the verify-enrollment endpoint. <see cref="Success"/> keeps the original
/// <c>{ success }</c> shape; <see cref="RecoveryCodes"/> is the freshly generated set of one-time
/// recovery codes. They are shown to the user once and never returned again.
/// </summary>
public sealed record TwoFactorVerifyResponse(bool Success, IReadOnlyList<string> RecoveryCodes);
