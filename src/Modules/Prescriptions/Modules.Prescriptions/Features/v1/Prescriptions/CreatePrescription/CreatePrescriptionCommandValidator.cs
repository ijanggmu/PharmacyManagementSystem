using FluentValidation;
using FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;

namespace FSH.Modules.Prescriptions.Features.v1.Prescriptions.CreatePrescription;

public sealed class CreatePrescriptionCommandValidator : AbstractValidator<CreatePrescriptionCommand>
{
    public CreatePrescriptionCommandValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty();
        RuleFor(x => x.DoctorName).NotEmpty().MaximumLength(256);
        RuleFor(x => x.ExpiryDate).GreaterThanOrEqualTo(x => x.PrescriptionDate);
        RuleFor(x => x.Notes).MaximumLength(2000);
        RuleFor(x => x.Items).NotEmpty().WithMessage("A prescription must have at least one item.");
        // One line per medicine: the dispensing check and refill bookkeeping match a sale line to the
        // prescription by medicine, so a second line for the same medicine could never be dispensed against.
        RuleFor(x => x.Items)
            .Must(items => items is null || items.Select(i => i.MedicineId).Distinct().Count() == items.Count)
            .WithMessage("Each medicine can appear only once on a prescription. Combine the quantities into one line.");
        RuleForEach(x => x.Items).ChildRules(item =>
        {
            item.RuleFor(i => i.MedicineId).NotEmpty();
            item.RuleFor(i => i.PrescribedQuantity).GreaterThan(0m);
            item.RuleFor(i => i.RefillsAllowed).GreaterThanOrEqualTo(0);
            item.RuleFor(i => i.DosageInstructions).MaximumLength(1000);
        });
    }
}
