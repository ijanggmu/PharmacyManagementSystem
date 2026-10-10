using FluentValidation;
using FSH.Modules.Inventory.Contracts.v1.Medicines;

namespace FSH.Modules.Inventory.Features.v1.Medicines.DeleteMedicine;

public sealed class DeleteMedicineCommandValidator : AbstractValidator<DeleteMedicineCommand>
{
    public DeleteMedicineCommandValidator()
    {
        RuleFor(x => x.MedicineId).NotEmpty();
    }
}
