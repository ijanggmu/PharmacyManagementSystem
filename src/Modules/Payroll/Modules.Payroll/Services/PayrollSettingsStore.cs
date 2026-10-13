using FSH.Modules.Payroll.Contracts.Dtos;
using FSH.Modules.Payroll.Data;
using FSH.Modules.Payroll.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Payroll.Services;

/// <summary>The tenant's single <see cref="PayrollSettings"/> row, created with the statutory defaults on first use.</summary>
internal static class PayrollSettingsStore
{
    /// <summary>The tracked settings row; a new default row is added (not saved) when the tenant has none.</summary>
    public static async ValueTask<PayrollSettings> GetOrAddAsync(PayrollDbContext dbContext, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        var settings = await dbContext.Settings.FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);
        if (settings is null)
        {
            settings = PayrollSettings.CreateDefault();
            dbContext.Settings.Add(settings);
        }

        return settings;
    }

    /// <summary>The rates in force (the defaults when the tenant never saved settings). Read-only.</summary>
    public static async ValueTask<PayrollRates> RatesAsync(PayrollDbContext dbContext, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        var settings = await dbContext.Settings.AsNoTracking().FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);
        return (settings ?? PayrollSettings.CreateDefault()).ToRates();
    }

    public static PayrollSettingsDto ToDto(PayrollSettings settings, int fiscalYearStart)
    {
        ArgumentNullException.ThrowIfNull(settings);
        var schedule = NepalPayrollDefaults.ScheduleFor(fiscalYearStart);
        return new PayrollSettingsDto(
            settings.EmployeeSsfRatePercent,
            settings.EmployerSsfRatePercent,
            settings.RetirementDeductionCap,
            NepalPayrollDefaults.Note,
            new PayrollTaxSlabsDto(
                Sales.Contracts.Fiscal.NepalFiscalYear.Label(fiscalYearStart),
                Bands(schedule.SingleBands),
                Bands(schedule.MarriedBands),
                schedule.Source),
            settings.UpdatedAtUtc);
    }

    /// <summary>Bands as cumulative upper limits (null = no limit), the way slabs are usually printed.</summary>
    private static List<PayrollTaxBandDto> Bands(IReadOnlyList<TaxBand> bands)
    {
        var result = new List<PayrollTaxBandDto>(bands.Count);
        decimal upTo = 0m;
        foreach (var band in bands)
        {
            decimal? limit = null;
            if (band.Width is { } width)
            {
                upTo += width;
                limit = upTo;
            }

            result.Add(new PayrollTaxBandDto(limit, band.RatePercent));
        }

        return result;
    }
}
