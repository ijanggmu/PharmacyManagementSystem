using FluentValidation;
using FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;

namespace FSH.Modules.Prescriptions.Features.v1.Prescriptions.CancelPrescription;

public sealed class CancelPrescriptionCommandValidator : AbstractValidator<CancelPrescriptionCommand>
{
    public CancelPrescriptionCommandValidator()
    {
        RuleFor(x => x.PrescriptionId).NotEmpty();
        RuleFor(x => x.Reason).NotEmpty().MaximumLength(512);
    }
}
