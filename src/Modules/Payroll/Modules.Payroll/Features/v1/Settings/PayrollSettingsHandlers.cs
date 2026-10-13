using FluentValidation;
using FSH.Modules.Payroll.Contracts.Dtos;
using FSH.Modules.Payroll.Contracts.v1;
using FSH.Modules.Payroll.Data;
using FSH.Modules.Payroll.Domain;
using FSH.Modules.Payroll.Services;
using FSH.Modules.Sales.Contracts.Fiscal;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Payroll.Features.v1.Settings;

public sealed class GetPayrollSettingsQueryHandler(PayrollDbContext dbContext, TimeProvider timeProvider)
    : IQueryHandler<GetPayrollSettingsQuery, PayrollSettingsDto>
{
    public async ValueTask<PayrollSettingsDto> Handle(GetPayrollSettingsQuery query, CancellationToken cancellationToken)
    {
        var settings = await dbContext.Settings.AsNoTracking().FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false)
            ?? PayrollSettings.CreateDefault();
        return PayrollSettingsStore.ToDto(settings, CurrentFiscalYear(timeProvider));
    }

    internal static int CurrentFiscalYear(TimeProvider timeProvider)
    {
        int fy = NepalFiscalYear.StartYearFor(timeProvider.GetUtcNow().UtcDateTime);
        return Math.Clamp(fy, NepalFiscalYear.FirstStartYear, NepalFiscalYear.LastStartYear);
    }
}

public sealed class UpdatePayrollSettingsCommandHandler(PayrollDbContext dbContext, TimeProvider timeProvider)
    : ICommandHandler<UpdatePayrollSettingsCommand, PayrollSettingsDto>
{
    public async ValueTask<PayrollSettingsDto> Handle(UpdatePayrollSettingsCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        var settings = await PayrollSettingsStore.GetOrAddAsync(dbContext, cancellationToken).ConfigureAwait(false);
        settings.Update(command.EmployeeSsfRatePercent, command.EmployerSsfRatePercent, command.RetirementDeductionCap,
            timeProvider.GetUtcNow().UtcDateTime);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return PayrollSettingsStore.ToDto(settings, GetPayrollSettingsQueryHandler.CurrentFiscalYear(timeProvider));
    }
}

public sealed class UpdatePayrollSettingsCommandValidator : AbstractValidator<UpdatePayrollSettingsCommand>
{
    public UpdatePayrollSettingsCommandValidator()
    {
        RuleFor(x => x.EmployeeSsfRatePercent).InclusiveBetween(0m, 100m);
        RuleFor(x => x.EmployerSsfRatePercent).InclusiveBetween(0m, 100m);
        RuleFor(x => x.RetirementDeductionCap).GreaterThanOrEqualTo(0m).LessThan(100_000_000m);
    }
}
