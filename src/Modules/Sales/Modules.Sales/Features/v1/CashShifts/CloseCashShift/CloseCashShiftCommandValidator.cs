using FluentValidation;
using FSH.Modules.Sales.Contracts.v1.CashShifts;

namespace FSH.Modules.Sales.Features.v1.CashShifts.CloseCashShift;

public sealed class CloseCashShiftCommandValidator : AbstractValidator<CloseCashShiftCommand>
{
    public CloseCashShiftCommandValidator()
    {
        RuleFor(x => x.CashShiftId).NotEmpty();
        RuleFor(x => x.ClosingCashCounted).GreaterThanOrEqualTo(0m);
        RuleFor(x => x.ClosingNotes).MaximumLength(1000);
    }
}
