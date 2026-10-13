using FluentValidation;
using FSH.Modules.Customers.Contracts.v1.Ledger;

namespace FSH.Modules.Customers.Features.v1.Ledger.GetReceivablesDue;

public sealed class GetReceivablesDueQueryValidator : AbstractValidator<GetReceivablesDueQuery>
{
    public GetReceivablesDueQueryValidator()
    {
        RuleFor(x => x.WithinDays).InclusiveBetween(0, 90);
        RuleFor(x => x.CustomerId).NotEqual(Guid.Empty).When(x => x.CustomerId is not null);
    }
}
