using FluentValidation;
using FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;
using FSH.Modules.Prescriptions.Domain;

namespace FSH.Modules.Prescriptions.Features.v1.Prescriptions.CreatePrescription;

public sealed class CreatePrescriptionCommandValidator : AbstractValidator<CreatePrescriptionCommand>
{
    public CreatePrescriptionCommandValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty();
        RuleFor(x => x.DoctorName).NotEmpty().MaximumLength(256);
        RuleFor(x => x.PrescriptionDate).NotEmpty();
        RuleFor(x => x.ExpiryDate).GreaterThanOrEqualTo(x => x.PrescriptionDate);
        // The outer bound; a controlled medicine tightens it (PrescriptionIssueChecks), as do today's date checks.
        RuleFor(x => x.ExpiryDate)
            .Must((command, expiry) => expiry <= PrescriptionRules.LatestExpiryFor(command.PrescriptionDate, hasControlledItem: false))
            .WithMessage($"A prescription is valid for at most {PrescriptionRules.MaxValidityMonths} months.");
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
            item.RuleFor(i => i.RefillsAllowed).InclusiveBetween(0, PrescriptionRules.MaxRefills);
            item.RuleFor(i => i.DosageInstructions).MaximumLength(1000);
        });
    }
}
