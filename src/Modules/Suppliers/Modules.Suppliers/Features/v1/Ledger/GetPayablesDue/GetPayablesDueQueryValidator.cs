using FluentValidation;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;

namespace FSH.Modules.Suppliers.Features.v1.Ledger.GetPayablesDue;

public sealed class GetPayablesDueQueryValidator : AbstractValidator<GetPayablesDueQuery>
{
    public GetPayablesDueQueryValidator()
    {
        RuleFor(x => x.WithinDays).InclusiveBetween(0, 90);
    }
}
