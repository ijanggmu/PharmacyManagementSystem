using FluentValidation;
using FSH.Modules.Suppliers.Contracts.v1.ExpiryClaims;
using FSH.Modules.Suppliers.Domain;

namespace FSH.Modules.Suppliers.Features.v1.ExpiryClaims.SearchExpiryClaims;

public sealed class SearchExpiryClaimsQueryValidator : AbstractValidator<SearchExpiryClaimsQuery>
{
    public SearchExpiryClaimsQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
        RuleFor(x => x.Status)
            .Must(s => Enum.TryParse<ExpiryClaimStatus>(s, true, out _))
            .When(x => !string.IsNullOrWhiteSpace(x.Status))
            .WithMessage("status must be one of: Draft, Sent, Accepted, Credited, Rejected.");
    }
}
