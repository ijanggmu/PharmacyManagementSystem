using Mediator;

namespace FSH.Modules.Multitenancy.Contracts.v1.SignUpTenant;

/// <summary>
/// Anonymous self-service tenant signup: a brand-new visitor creates their own pharmacy and
/// becomes its Admin, with no manual seeding. Wraps <c>CreateTenantCommand</c> — the tenant id
/// becomes the slug, the admin identity is created fresh from <see cref="AdminEmail"/> /
/// <see cref="AdminPassword"/> (see <c>CreateTenantCommandHandler</c> / <c>IdentityDbInitializer</c>),
/// and the plan always falls back to the configured free/trial plan (no payment collected here).
/// </summary>
public sealed record SignUpTenantCommand(
    string PharmacyName,
    string Slug,
    string AdminFirstName,
    string AdminLastName,
    string AdminEmail,
    string? AdminPassword,
    string? AdminConfirmPassword,
    string? PhoneNumber = null,
    // Sign up with Google instead of a password: a Google ID token whose verified email equals
    // AdminEmail. The admin then signs in with Google (the account is connected during provisioning).
    string? GoogleIdToken = null) : ICommand<SignUpTenantCommandResponse>;
