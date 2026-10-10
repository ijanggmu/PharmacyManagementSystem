using FluentValidation;
using FSH.Modules.Reference.Contracts.v1.TenantSettings;

namespace FSH.Modules.Reference.Features.v1.TenantSettings.GetTenantSettings;

public sealed class GetTenantSettingsQueryValidator : AbstractValidator<GetTenantSettingsQuery>
{
    public GetTenantSettingsQueryValidator()
    {
        When(x => x.Category is not null, () =>
        {
            RuleFor(x => x.Category!)
                .NotEmpty()
                .MaximumLength(64)
                .Must(c => !c.Contains('.', StringComparison.Ordinal))
                .WithMessage("category is the part of a setting key before the first '.', so it cannot contain '.'.");
        });
    }
}
