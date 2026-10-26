using FluentValidation;
using FSH.Modules.Appointments.Contracts.Dtos;
using FSH.Modules.Appointments.Contracts.v1.Doctors;

namespace FSH.Modules.Appointments.Features.v1.Doctors.UpdateDoctor;

public sealed class UpdateDoctorCommandValidator : AbstractValidator<UpdateDoctorCommand>
{
    public UpdateDoctorCommandValidator()
    {
        RuleFor(x => x.DoctorId).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.NmcNumber).MaximumLength(64);
        RuleFor(x => x.Speciality).MaximumLength(128);
        RuleFor(x => x.Phone).MaximumLength(32);
        RuleFor(x => x.Fee).InclusiveBetween(0, 1_000_000);
        RuleFor(x => x.ShareType)
            .Must(DoctorShareRules.IsKnown)
            .WithMessage("ShareType must be Percent or Fixed.");
        RuleFor(x => x.ShareValue).GreaterThanOrEqualTo(0);
        RuleFor(x => x.ShareValue)
            .LessThanOrEqualTo(100)
            .When(x => DoctorShareRules.Is(x.ShareType, DoctorShareTypes.Percent))
            .WithMessage("The doctor's share can't be more than 100%.");
        RuleFor(x => x.ShareValue)
            .LessThanOrEqualTo(x => x.Fee)
            .When(x => DoctorShareRules.Is(x.ShareType, DoctorShareTypes.Fixed))
            .WithMessage("The doctor's share can't be more than the fee.");
    }
}
