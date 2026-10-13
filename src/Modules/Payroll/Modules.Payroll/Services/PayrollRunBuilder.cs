using FSH.Modules.Payroll.Contracts.Dtos;
using FSH.Modules.Payroll.Data;
using FSH.Modules.Payroll.Domain;
using FSH.Modules.Sales.Contracts.Fiscal;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Payroll.Services;

/// <summary>One employee's computed line, before it is saved.</summary>
internal sealed record ComputedPayrollLine(Employee Employee, int DaysWorked, int DaysInMonth, PayrollLineResult Result);

internal sealed record PayrollComputation(
    NepaliMonth Month,
    IReadOnlyList<ComputedPayrollLine> Lines,
    IReadOnlyList<PayrollSkippedEmployeeDto> Skipped);

/// <summary>
/// Computes a branch's payroll for a Nepali month: every active employee of the branch who has joined by the month's
/// end and has a salary structure effective by then, with year-to-date figures from the employee's earlier recorded
/// runs of the same fiscal year (any branch). Employees that can't be paid are listed in
/// <see cref="PayrollComputation.Skipped"/> with the reason. Reads only.
/// </summary>
internal static class PayrollRunBuilder
{
    public static async Task<PayrollComputation> ComputeAsync(
        PayrollDbContext dbContext, Guid branchId, NepaliMonth month, Guid? excludeRunId, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(month);

        var rates = await PayrollSettingsStore.RatesAsync(dbContext, cancellationToken).ConfigureAwait(false);
        var schedule = NepalPayrollDefaults.ScheduleFor(month.FiscalYearStart);
        DateOnly fiscalYearStartDate = NepalFiscalYear.Range(month.FiscalYearStart).Start;

        var employees = await dbContext.Employees
            .AsNoTracking()
            .Where(e => e.BranchId == branchId && e.IsActive)
            .OrderBy(e => e.FullName)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        var ids = employees.Select(e => e.Id).ToList();

        var structures = await dbContext.SalaryStructures
            .AsNoTracking()
            .Where(s => ids.Contains(s.EmployeeId) && s.EffectiveFrom <= month.End)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        var currentStructure = structures
            .GroupBy(s => s.EmployeeId)
            .ToDictionary(g => g.Key, g => g.OrderByDescending(s => s.EffectiveFrom).First());

        var prior = await (
                from line in dbContext.RunLines.AsNoTracking()
                join run in dbContext.Runs.AsNoTracking() on line.RunId equals run.Id
                where ids.Contains(line.EmployeeId)
                      && run.FiscalYearStart == month.FiscalYearStart
                      && run.MonthOfFiscalYear < month.MonthOfFiscalYear
                      && (run.Status == PayrollRunStatuses.Approved || run.Status == PayrollRunStatuses.Posted || run.Status == PayrollRunStatuses.Paid)
                      && (excludeRunId == null || run.Id != excludeRunId)
                select new
                {
                    line.EmployeeId,
                    run.MonthOfFiscalYear,
                    line.AssessableIncome,
                    line.RetirementContribution,
                    Tax = line.SocialSecurityTax + line.IncomeTax,
                })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        var priorByEmployee = prior.GroupBy(p => p.EmployeeId).ToDictionary(
            g => g.Key,
            g => new YearToDate(
                g.Select(p => p.MonthOfFiscalYear).Distinct().Count(),
                g.Sum(p => p.AssessableIncome),
                g.Sum(p => p.RetirementContribution),
                g.Sum(p => p.Tax)));

        var lines = new List<ComputedPayrollLine>();
        var skipped = new List<PayrollSkippedEmployeeDto>();
        foreach (var employee in employees)
        {
            if (employee.JoiningDate > month.End)
            {
                skipped.Add(new(employee.Id, employee.FullName, "Joins after this month."));
                continue;
            }

            if (!currentStructure.TryGetValue(employee.Id, out var structure))
            {
                skipped.Add(new(employee.Id, employee.FullName, "No salary structure effective by the end of this month."));
                continue;
            }

            int daysWorked = employee.JoiningDate > month.Start
                ? month.End.DayNumber - employee.JoiningDate.DayNumber + 1
                : month.Days;

            var ytd = priorByEmployee.GetValueOrDefault(employee.Id) ?? YearToDate.None;
            int joinedMonthOfYear = employee.JoiningDate < fiscalYearStartDate
                ? 1
                : NepaliMonth.MonthOfFiscalYearFor(BikramSambat.FromAd(employee.JoiningDate).Month);
            int elapsedEmploymentMonths = Math.Max(0, month.MonthOfFiscalYear - joinedMonthOfYear);
            int missing = Math.Max(0, elapsedEmploymentMonths - ytd.Months);

            var result = PayrollCalculator.Compute(
                new PayrollLineInput(
                    MonthlyPay.From(structure), daysWorked, month.Days,
                    Married: employee.MaritalStatus == PayrollMaritalStatus.Married,
                    employee.SsfEnrolled, month.RemainingMonthsInFiscalYear, missing, ytd),
                rates, schedule);

            if (result.Net < 0m)
            {
                skipped.Add(new(employee.Id, employee.FullName, "Deductions are more than this month's pay — reduce the other deduction or CIT."));
                continue;
            }

            lines.Add(new ComputedPayrollLine(employee, daysWorked, month.Days, result));
        }

        return new PayrollComputation(month, lines, skipped);
    }

    public static PayrollPreviewDto ToPreview(Guid branchId, PayrollComputation computation)
    {
        ArgumentNullException.ThrowIfNull(computation);
        var runLines = computation.Lines
            .Select(l => PayrollRunLine.Create(Guid.Empty, l.Employee, l.DaysWorked, l.DaysInMonth, l.Result))
            .ToList();
        var month = computation.Month;
        return new PayrollPreviewDto(
            branchId, month.BsYear, month.BsMonth, month.Label, month.FiscalYearLabel, month.Start, month.End,
            PayrollMapping.Totals(runLines), runLines.Select(l => l.ToDto()).ToList(), computation.Skipped);
    }
}
