using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Reports;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetCashFlowStatement;

public sealed class GetCashFlowStatementQueryValidator : AbstractValidator<GetCashFlowStatementQuery>
{
    public GetCashFlowStatementQueryValidator()
    {
        RuleFor(x => x.FromUtc).NotEmpty();
        RuleFor(x => x.ToUtc).NotEmpty().GreaterThanOrEqualTo(x => x.FromUtc);
    }
}
