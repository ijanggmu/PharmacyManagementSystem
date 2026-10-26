using FluentValidation;
using FSH.Modules.Appointments.Contracts.v1.Timetable;
using FSH.Modules.Appointments.Services;

namespace FSH.Modules.Appointments.Features.v1.Timetable.GetTimetable;

public sealed class GetTimetableQueryValidator : AbstractValidator<GetTimetableQuery>
{
    public GetTimetableQueryValidator()
    {
        RuleFor(x => x.From).NotEmpty();
        RuleFor(x => x.To).NotEmpty();
        RuleFor(x => x.To)
            .GreaterThanOrEqualTo(x => x.From)
            .WithMessage("To must be on or after From.");
        RuleFor(x => x)
            .Must(x => x.To.DayNumber - x.From.DayNumber < SessionCalendar.MaxRangeDays)
            .WithMessage($"Show at most {SessionCalendar.MaxRangeDays} days at a time.");
    }
}
