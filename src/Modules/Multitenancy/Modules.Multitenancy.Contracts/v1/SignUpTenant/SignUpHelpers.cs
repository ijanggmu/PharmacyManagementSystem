using Mediator;

namespace FSH.Modules.Multitenancy.Contracts.v1.SignUpTenant;

/// <summary>Anonymous provisioning progress for a self-service sign-up. The correlation id returned by the
/// sign-up call is required, so only the person who signed up can follow it.</summary>
public sealed record GetSignUpStatusQuery(string TenantId, string CorrelationId) : IQuery<SignUpStatusDto>;

public sealed record SignUpStepDto(string Step, string Status);

/// <summary>Sign-up progress. <c>Status</c> is Pending, Running, Completed or Failed; <c>Error</c> is a
/// user-safe message when provisioning failed.</summary>
public sealed record SignUpStatusDto(
    string TenantId,
    string Status,
    string? CurrentStep,
    string? Error,
    IReadOnlyList<SignUpStepDto> Steps);

/// <summary>Live availability check for the sign-up form's pharmacy code and name.</summary>
public sealed record CheckSignUpAvailabilityQuery(string? Slug, string? PharmacyName) : IQuery<SignUpAvailabilityDto>;

/// <summary>Null fields were not asked about.</summary>
public sealed record SignUpAvailabilityDto(
    bool? SlugAvailable,
    string? SlugMessage,
    bool? NameAvailable,
    string? NameMessage);
