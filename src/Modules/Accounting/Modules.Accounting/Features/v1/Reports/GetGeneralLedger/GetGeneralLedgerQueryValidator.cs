using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Reports;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetGeneralLedger;

public sealed class GetGeneralLedgerQueryValidator : AbstractValidator<GetGeneralLedgerQuery>
{
    public GetGeneralLedgerQueryValidator()
    {
        RuleFor(x => x.ToUtc).GreaterThanOrEqualTo(x => x.FromUtc);
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
    }
}
