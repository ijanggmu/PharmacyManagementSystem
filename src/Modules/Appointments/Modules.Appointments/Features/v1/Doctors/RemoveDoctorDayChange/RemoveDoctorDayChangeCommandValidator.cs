using FluentValidation;
using FSH.Modules.Appointments.Contracts.v1.Doctors;

namespace FSH.Modules.Appointments.Features.v1.Doctors.RemoveDoctorDayChange;

public sealed class RemoveDoctorDayChangeCommandValidator : AbstractValidator<RemoveDoctorDayChangeCommand>
{
    public RemoveDoctorDayChangeCommandValidator()
    {
        RuleFor(x => x.DoctorId).NotEmpty();
        RuleFor(x => x.DayChangeId).NotEmpty();
    }
}
