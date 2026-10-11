using FluentValidation;
using FSH.Modules.Customers.Contracts.v1.Ledger;

namespace FSH.Modules.Customers.Features.v1.Ledger.GetCustomerLedger;

public sealed class GetCustomerLedgerQueryValidator : AbstractValidator<GetCustomerLedgerQuery>
{
    public GetCustomerLedgerQueryValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty();
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
    }
}
