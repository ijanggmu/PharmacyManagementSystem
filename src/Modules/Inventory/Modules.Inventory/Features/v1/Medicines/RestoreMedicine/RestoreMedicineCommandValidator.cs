using FluentValidation;
using FSH.Modules.Inventory.Contracts.v1.Medicines;

namespace FSH.Modules.Inventory.Features.v1.Medicines.RestoreMedicine;

public sealed class RestoreMedicineCommandValidator : AbstractValidator<RestoreMedicineCommand>
{
    public RestoreMedicineCommandValidator()
    {
        RuleFor(x => x.MedicineId).NotEmpty();
    }
}
