using FluentValidation;
using FSH.Modules.Inventory.Contracts.v1.Medicines;

namespace FSH.Modules.Inventory.Features.v1.Medicines.RecallMedicineBatch;

public sealed class RecallMedicineBatchCommandValidator : AbstractValidator<RecallMedicineBatchCommand>
{
    public RecallMedicineBatchCommandValidator()
    {
        RuleFor(x => x.MedicineId).NotEmpty();
        RuleFor(x => x.BatchNumber).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Reason).MaximumLength(500);
    }
}
