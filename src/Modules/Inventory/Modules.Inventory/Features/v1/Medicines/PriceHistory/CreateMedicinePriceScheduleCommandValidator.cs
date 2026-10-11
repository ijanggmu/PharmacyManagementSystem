using FluentValidation;
using FSH.Modules.Inventory.Contracts.v1.Medicines;

namespace FSH.Modules.Inventory.Features.v1.Medicines.PriceHistory;

public sealed class CreateMedicinePriceScheduleCommandValidator : AbstractValidator<CreateMedicinePriceScheduleCommand>
{
    public CreateMedicinePriceScheduleCommandValidator()
    {
        RuleFor(x => x.MedicineId).NotEmpty();
        RuleFor(x => x.UnitPrice).GreaterThanOrEqualTo(0m);
        RuleFor(x => x.CostPrice).GreaterThanOrEqualTo(0m).When(x => x.CostPrice is not null);
        RuleFor(x => x.Reason).MaximumLength(500);
    }
}
