using FluentValidation;
using FSH.Modules.Multitenancy.Contracts.v1.SignUpTenant;

namespace FSH.Modules.Multitenancy.Features.v1.SignUpTenant;

public sealed class SignUpTenantCommandValidator : AbstractValidator<SignUpTenantCommand>
{
    // Small anti-abuse blocklist: slugs that would collide with system routes/identities or
    // read as impersonating the platform itself. Uniqueness-against-existing-tenants is already
    // checked by CreateTenantCommandValidator when this command's nested CreateTenantCommand runs.
    internal static readonly HashSet<string> ReservedSlugs = new(StringComparer.OrdinalIgnoreCase)
    {
        "root", "admin", "administrator", "superadmin", "api", "www", "app", "system", "static",
        "public", "assets", "login", "signup", "support", "help", "null", "undefined",
    };

    /// <summary>Identity's required password length (IdentityModuleConstants.PasswordLength).</summary>
    public const int MinPasswordLength = 10;

    public SignUpTenantCommandValidator()
    {
        RuleFor(t => t.PharmacyName).Cascade(CascadeMode.Stop)
            .NotEmpty()
            .MaximumLength(200);

        RuleFor(t => t.Slug).Cascade(CascadeMode.Stop)
            .NotEmpty()
            .Matches("^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$")
            .WithMessage("Slug must be lowercase letters, numbers and single hyphens (2-40 characters).")
            .Must(slug => !ReservedSlugs.Contains(slug))
            .WithMessage((_, slug) => $"'{slug}' is reserved and can't be used as a pharmacy slug.");

        RuleFor(t => t.AdminFirstName).NotEmpty().MaximumLength(100);
        RuleFor(t => t.AdminLastName).NotEmpty().MaximumLength(100);

        RuleFor(t => t.AdminEmail).Cascade(CascadeMode.Stop)
            .NotEmpty()
            .EmailAddress();

        // Password sign-up only (Google sign-up generates the password). Mirrors Identity's password
        // policy (IdentityModuleConstants.PasswordLength + digit/upper/lower), which the tenant seed step
        // doesn't re-check because it hashes the password directly.
        When(t => string.IsNullOrWhiteSpace(t.GoogleIdToken), () =>
        {
            RuleFor(t => t.AdminPassword).Cascade(CascadeMode.Stop)
                .NotEmpty()
                .MinimumLength(MinPasswordLength)
                .WithMessage($"Password must be at least {MinPasswordLength} characters.")
                .Matches("[0-9]").WithMessage("Password must contain a number.")
                .Matches("[a-z]").WithMessage("Password must contain a lowercase letter.")
                .Matches("[A-Z]").WithMessage("Password must contain an uppercase letter.");

            RuleFor(t => t.AdminConfirmPassword).Cascade(CascadeMode.Stop)
                .NotEmpty()
                .Equal(t => t.AdminPassword)
                .WithMessage("Passwords do not match.");
        });

        RuleFor(t => t.GoogleIdToken)
            .MaximumLength(8192)
            .When(t => !string.IsNullOrWhiteSpace(t.GoogleIdToken));

        RuleFor(t => t.PhoneNumber)
            .Matches(@"^\+?[0-9\s-]{7,16}$")
            .When(t => !string.IsNullOrWhiteSpace(t.PhoneNumber))
            .WithMessage("Enter a valid phone number.");
    }
}
