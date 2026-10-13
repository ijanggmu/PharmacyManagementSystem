using FluentValidation;
using FSH.Modules.Suppliers.Contracts.v1.ExpiryClaims;

namespace FSH.Modules.Suppliers.Features.v1.ExpiryClaims.GetExpiryClaimCandidates;

public sealed class GetExpiryClaimCandidatesQueryValidator : AbstractValidator<GetExpiryClaimCandidatesQuery>
{
    public GetExpiryClaimCandidatesQueryValidator()
    {
        RuleFor(x => x.WithinDays).InclusiveBetween(0, 730);
    }
}
