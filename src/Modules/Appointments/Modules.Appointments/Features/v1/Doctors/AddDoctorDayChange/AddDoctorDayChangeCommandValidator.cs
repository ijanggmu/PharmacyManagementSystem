using FluentValidation;
using FSH.Modules.Appointments.Contracts.Dtos;
using FSH.Modules.Appointments.Contracts.v1.Doctors;
using FSH.Modules.Appointments.Domain;

namespace FSH.Modules.Appointments.Features.v1.Doctors.AddDoctorDayChange;

public sealed class AddDoctorDayChangeCommandValidator : AbstractValidator<AddDoctorDayChangeCommand>
{
    public AddDoctorDayChangeCommandValidator()
    {
        RuleFor(x => x.DoctorId).NotEmpty();
        RuleFor(x => x.Date).NotEmpty();
        RuleFor(x => x.Kind)
            .Must(k => IsKind(k, DoctorDayChangeKinds.DayOff) || IsKind(k, DoctorDayChangeKinds.ExtraDay))
            .WithMessage("Kind must be DayOff or ExtraDay.");
        RuleFor(x => x.Note).MaximumLength(256);

        When(x => IsKind(x.Kind, DoctorDayChangeKinds.ExtraDay), () =>
        {
            RuleFor(x => x.BranchId).NotEmpty().WithMessage("Pick the branch for the extra day.");
            RuleFor(x => x.StartTime).NotNull();
            RuleFor(x => x.EndTime).NotNull();
            RuleFor(x => x.EndTime)
                .GreaterThan(x => x.StartTime)
                .When(x => x.StartTime is not null && x.EndTime is not null)
                .WithMessage("The end time must be after the start time.");
            RuleFor(x => x.MaxTokens).NotNull().InclusiveBetween(1, Doctor.MaxTokensPerSitting);
        });
    }

    private static bool IsKind(string? kind, string expected) =>
        string.Equals(kind, expected, StringComparison.OrdinalIgnoreCase);
}
