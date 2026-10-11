using FluentValidation;
using FSH.Modules.Multitenancy.Contracts.v1.GetTenantByCode;

namespace FSH.Modules.Multitenancy.Features.v1.GetTenantByCode;

public sealed class GetTenantByCodeQueryValidator : AbstractValidator<GetTenantByCodeQuery>
{
    public GetTenantByCodeQueryValidator()
    {
        RuleFor(q => q.Code)
            .NotEmpty()
            .MaximumLength(100);
    }
}
