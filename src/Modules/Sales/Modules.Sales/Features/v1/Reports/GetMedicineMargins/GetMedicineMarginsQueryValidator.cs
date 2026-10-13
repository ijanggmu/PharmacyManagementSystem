using FluentValidation;
using FSH.Modules.Sales.Contracts.v1.Reports;

namespace FSH.Modules.Sales.Features.v1.Reports.GetMedicineMargins;

public sealed class GetMedicineMarginsQueryValidator : AbstractValidator<GetMedicineMarginsQuery>
{
    public GetMedicineMarginsQueryValidator()
    {
        RuleFor(x => x.ToUtc).GreaterThanOrEqualTo(x => x.FromUtc);
        RuleFor(x => x.Take).InclusiveBetween(1, 50);
    }
}
