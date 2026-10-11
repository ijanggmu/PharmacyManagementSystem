using FluentValidation;
using FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;

namespace FSH.Modules.Prescriptions.Features.v1.Prescriptions.UpdatePrescription;

public sealed class UpdatePrescriptionCommandValidator : AbstractValidator<UpdatePrescriptionCommand>
{
    public UpdatePrescriptionCommandValidator()
    {
        RuleFor(x => x.PrescriptionId).NotEmpty();
        When(x => x.DoctorName is not null, () =>
        {
            RuleFor(x => x.DoctorName).NotEmpty().MaximumLength(256);
        });
        RuleFor(x => x.Notes).MaximumLength(2000);
        When(x => x.Items is not null, () =>
        {
            RuleForEach(x => x.Items!).ChildRules(item =>
            {
                item.RuleFor(i => i.ItemId).NotEmpty();
                item.RuleFor(i => i.DosageInstructions).MaximumLength(1000);
            });
        });
    }
}
