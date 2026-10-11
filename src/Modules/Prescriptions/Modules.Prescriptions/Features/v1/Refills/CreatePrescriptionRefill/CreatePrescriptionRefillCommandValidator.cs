using FluentValidation;
using FSH.Modules.Prescriptions.Contracts.v1.Refills;

namespace FSH.Modules.Prescriptions.Features.v1.Refills.CreatePrescriptionRefill;

public sealed class CreatePrescriptionRefillCommandValidator : AbstractValidator<CreatePrescriptionRefillCommand>
{
    public CreatePrescriptionRefillCommandValidator()
    {
        RuleFor(x => x.PrescriptionId).NotEmpty();
        RuleFor(x => x.MedicineId).NotEmpty();
        RuleFor(x => x.QuantityDispensed).GreaterThan(0m);
        RuleFor(x => x.Notes).MaximumLength(1000);
    }
}
