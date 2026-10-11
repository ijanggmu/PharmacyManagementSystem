using FluentValidation;
using FSH.Modules.Inventory.Contracts.v1.Medicines;

namespace FSH.Modules.Inventory.Features.v1.Medicines.PriceHistory;

public sealed class CancelMedicinePriceScheduleCommandValidator : AbstractValidator<CancelMedicinePriceScheduleCommand>
{
    public CancelMedicinePriceScheduleCommandValidator()
    {
        RuleFor(x => x.MedicineId).NotEmpty();
        RuleFor(x => x.HistoryId).NotEmpty();
    }
}
