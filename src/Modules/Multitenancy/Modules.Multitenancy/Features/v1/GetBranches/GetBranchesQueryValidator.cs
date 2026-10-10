using FluentValidation;
using FSH.Framework.Web.Validation;
using FSH.Modules.Multitenancy.Contracts.v1.GetBranches;

namespace FSH.Modules.Multitenancy.Features.v1.GetBranches;

public sealed class GetBranchesQueryValidator : AbstractValidator<GetBranchesQuery>
{
    public GetBranchesQueryValidator()
    {
        Include(new PagedQueryValidator<GetBranchesQuery>());
    }
}
