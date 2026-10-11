using FluentValidation;
using FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;

namespace FSH.Modules.Prescriptions.Features.v1.Prescriptions.DeletePrescription;

public sealed class DeletePrescriptionCommandValidator : AbstractValidator<DeletePrescriptionCommand>
{
    public DeletePrescriptionCommandValidator()
    {
        RuleFor(x => x.PrescriptionId).NotEmpty();
    }
}
