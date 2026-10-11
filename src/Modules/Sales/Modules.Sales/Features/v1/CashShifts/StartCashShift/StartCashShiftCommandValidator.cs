using FluentValidation;
using FSH.Modules.Sales.Contracts.v1.CashShifts;

namespace FSH.Modules.Sales.Features.v1.CashShifts.StartCashShift;

public sealed class StartCashShiftCommandValidator : AbstractValidator<StartCashShiftCommand>
{
    public StartCashShiftCommandValidator()
    {
        RuleFor(x => x.OpeningFloat).GreaterThanOrEqualTo(0m);
        RuleFor(x => x.Notes).MaximumLength(1024);
    }
}
