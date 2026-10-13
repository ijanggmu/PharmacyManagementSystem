using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.FiscalYears;
using FSH.Modules.Sales.Contracts.Fiscal;

namespace FSH.Modules.Accounting.Features.v1.FiscalYears.CloseFiscalYear;

/// <summary>The fiscal year must be one the Nepali fiscal-year table covers. Whether it has ended, is already closed
/// or has an earlier open year is checked by <c>FiscalYearCloseService</c> (409).</summary>
public sealed class CloseFiscalYearCommandValidator : AbstractValidator<CloseFiscalYearCommand>
{
    public CloseFiscalYearCommandValidator()
    {
        RuleFor(x => x.FiscalYear)
            .InclusiveBetween(NepalFiscalYear.FirstStartYear, NepalFiscalYear.LastStartYear)
            .WithMessage($"The fiscal year must be a BS start year from {NepalFiscalYear.FirstStartYear} to {NepalFiscalYear.LastStartYear}.");
    }
}
