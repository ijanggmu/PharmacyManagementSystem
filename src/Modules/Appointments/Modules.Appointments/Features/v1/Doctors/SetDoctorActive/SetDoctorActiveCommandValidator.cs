using FluentValidation;
using FSH.Modules.Appointments.Contracts.v1.Doctors;

namespace FSH.Modules.Appointments.Features.v1.Doctors.SetDoctorActive;

public sealed class SetDoctorActiveCommandValidator : AbstractValidator<SetDoctorActiveCommand>
{
    public SetDoctorActiveCommandValidator()
    {
        RuleFor(x => x.DoctorId).NotEmpty();
    }
}
