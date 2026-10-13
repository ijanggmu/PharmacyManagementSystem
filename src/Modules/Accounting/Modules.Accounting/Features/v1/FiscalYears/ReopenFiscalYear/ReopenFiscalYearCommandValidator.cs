using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.FiscalYears;
using FSH.Modules.Sales.Contracts.Fiscal;

namespace FSH.Modules.Accounting.Features.v1.FiscalYears.ReopenFiscalYear;

public sealed class ReopenFiscalYearCommandValidator : AbstractValidator<ReopenFiscalYearCommand>
{
    public ReopenFiscalYearCommandValidator()
    {
        RuleFor(x => x.FiscalYear)
            .InclusiveBetween(NepalFiscalYear.FirstStartYear, NepalFiscalYear.LastStartYear)
            .WithMessage($"The fiscal year must be a BS start year from {NepalFiscalYear.FirstStartYear} to {NepalFiscalYear.LastStartYear}.");
    }
}
