using FluentValidation;
using FSH.Framework.Persistence;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Multitenancy.Contracts.v1.CreateTenant;
using FSH.Modules.Multitenancy.Features.v1.SignUpTenant;

namespace FSH.Modules.Multitenancy.Features.v1.CreateTenant;

public sealed class CreateTenantCommandValidator : AbstractValidator<CreateTenantCommand>
{
    public CreateTenantCommandValidator(ITenantService tenantService, IConnectionStringValidator connectionStringValidator)
    {
        // Optional: empty means the handler generates a unique code from the name.
        RuleFor(t => t.Id!).Cascade(CascadeMode.Stop)
            .Matches("^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$")
            .WithMessage("Tenant code must be 2-40 lowercase letters, numbers and hyphens, starting and ending with a letter or number.")
            .Must(id => !SignUpTenantCommandValidator.ReservedSlugs.Contains(id))
            .WithMessage((_, id) => $"'{id}' is reserved and can't be used as a tenant code.")
            .MustAsync(async (id, ct) => !await tenantService.ExistsWithIdAsync(id, ct).ConfigureAwait(false))
            .WithMessage((_, id) => $"Tenant code '{id}' is already taken.")
            .When(t => !string.IsNullOrWhiteSpace(t.Id));

        RuleFor(t => t.Name).Cascade(CascadeMode.Stop)
            .NotEmpty().WithMessage("Enter the pharmacy name.")
            .Must(name => name.Trim().Length >= 2).WithMessage("Pharmacy name must be at least 2 characters.")
            .MaximumLength(200).WithMessage("Pharmacy name must be at most 200 characters.")
            .MustAsync(async (name, ct) => !await tenantService.ExistsWithNameAsync(name.Trim(), ct).ConfigureAwait(false))
            .WithMessage((_, name) => $"A pharmacy named '{name.Trim()}' already exists.");

        RuleFor(t => t.ConnectionString).Cascade(CascadeMode.Stop)
            .Must((_, cs) => string.IsNullOrWhiteSpace(cs) || connectionStringValidator.TryValidate(cs))
            .WithMessage("Connection string invalid.");

        RuleFor(t => t.AdminEmail).Cascade(CascadeMode.Stop)
            .NotEmpty().WithMessage("Enter the admin email.")
            .MaximumLength(256).WithMessage("Admin email must be at most 256 characters.")
            .EmailAddress().WithMessage("Enter a valid admin email.");

        // The tenant seed hashes this password directly (no Identity validators run), so the full Identity
        // policy is enforced here: IdentityModuleConstants.PasswordLength + digit/lower/upper.
        RuleFor(t => t.AdminPassword).Cascade(CascadeMode.Stop)
            .NotEmpty().WithMessage("Enter the admin password.")
            .MinimumLength(SignUpTenantCommandValidator.MinPasswordLength)
            .WithMessage($"Admin password must be at least {SignUpTenantCommandValidator.MinPasswordLength} characters.")
            .MaximumLength(128).WithMessage("Admin password must be at most 128 characters.")
            .Matches("[0-9]").WithMessage("Admin password must contain a number.")
            .Matches("[a-z]").WithMessage("Admin password must contain a lowercase letter.")
            .Matches("[A-Z]").WithMessage("Admin password must contain an uppercase letter.");

        // Optional: null/empty falls back to the configured default plan. When supplied it must be a
        // lowercase plan slug; existence is validated by GetPlanTerm in the handler.
        RuleFor(t => t.PlanKey)
            .Matches("^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$")
            .When(t => !string.IsNullOrWhiteSpace(t.PlanKey))
            .WithMessage("Plan key must be a lowercase slug (a-z, 0-9, hyphen).");
    }
}
