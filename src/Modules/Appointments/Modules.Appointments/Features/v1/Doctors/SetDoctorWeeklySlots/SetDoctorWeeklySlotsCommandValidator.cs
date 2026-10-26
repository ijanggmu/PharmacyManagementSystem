using FluentValidation;
using FSH.Modules.Appointments.Contracts.v1.Doctors;
using FSH.Modules.Appointments.Domain;

namespace FSH.Modules.Appointments.Features.v1.Doctors.SetDoctorWeeklySlots;

public sealed class SetDoctorWeeklySlotsCommandValidator : AbstractValidator<SetDoctorWeeklySlotsCommand>
{
    /// <summary>Two sittings a day, every day, is far more than any visiting doctor keeps.</summary>
    public const int MaxSlots = 28;

    public SetDoctorWeeklySlotsCommandValidator()
    {
        RuleFor(x => x.DoctorId).NotEmpty();
        RuleFor(x => x.Slots).NotNull();
        RuleFor(x => x.Slots.Count).LessThanOrEqualTo(MaxSlots).When(x => x.Slots is not null);
        RuleForEach(x => x.Slots).ChildRules(slot =>
        {
            slot.RuleFor(s => s.BranchId).NotEmpty().WithMessage("Pick the branch for each sitting.");
            slot.RuleFor(s => s.DayOfWeek).InclusiveBetween(0, 6);
            slot.RuleFor(s => s.EndTime).GreaterThan(s => s.StartTime)
                .WithMessage("The end time must be after the start time.");
            slot.RuleFor(s => s.MaxTokens).InclusiveBetween(1, Doctor.MaxTokensPerSitting);
        });
    }
}
