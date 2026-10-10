using FSH.Modules.Identity.Contracts.DTOs;
using Mediator;

namespace FSH.Modules.Identity.Contracts.v1.TwoFactor;

/// <summary>Two-factor state for the current user (enabled flag and remaining recovery codes).</summary>
public sealed record GetTwoFactorStatusQuery : IQuery<TwoFactorStatusResponse>;
