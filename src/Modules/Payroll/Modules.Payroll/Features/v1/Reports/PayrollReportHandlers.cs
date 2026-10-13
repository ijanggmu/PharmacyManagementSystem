using FluentValidation;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Payroll.Contracts.Dtos;
using FSH.Modules.Payroll.Contracts.v1;
using FSH.Modules.Payroll.Data;
using FSH.Modules.Payroll.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Payroll.Features.v1.Reports;

/// <summary>The month's SSF contributions from posted / paid runs — what the employer deposits with the SSF.</summary>
public sealed class GetSsfReportQueryHandler(PayrollDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetSsfReportQuery, SsfReportDto>
{
    public async ValueTask<SsfReportDto> Handle(GetSsfReportQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        Guid? branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);
        var lines = await ReportLines.LoadAsync(dbContext, query.BsYear, query.BsMonth, branchId, cancellationToken).ConfigureAwait(false);

        var rows = lines
            .Where(l => l.Line.SsfEnrolled && (l.Line.EmployeeSsf != 0m || l.Line.EmployerSsf != 0m))
            .Select(l => new SsfReportRowDto(
                l.Line.EmployeeId, l.Line.EmployeeName, l.Line.SsfNumber, l.BranchId, l.Line.Basic,
                l.Line.EmployeeSsf, l.Line.EmployerSsf, l.Line.EmployeeSsf + l.Line.EmployerSsf))
            .OrderBy(r => r.EmployeeName, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new SsfReportDto(
            query.BsYear, query.BsMonth, ReportLines.Label(query.BsYear, query.BsMonth), rows,
            rows.Sum(r => r.Basic), rows.Sum(r => r.EmployeeSsf), rows.Sum(r => r.EmployerSsf), rows.Sum(r => r.Total));
    }
}

/// <summary>The month's salary TDS (social security tax + income tax) from posted / paid runs — what is deposited with IRD.</summary>
public sealed class GetSalaryTdsReportQueryHandler(PayrollDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetSalaryTdsReportQuery, SalaryTdsReportDto>
{
    public async ValueTask<SalaryTdsReportDto> Handle(GetSalaryTdsReportQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        Guid? branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);
        var lines = await ReportLines.LoadAsync(dbContext, query.BsYear, query.BsMonth, branchId, cancellationToken).ConfigureAwait(false);

        var rows = lines
            .Select(l => new SalaryTdsReportRowDto(
                l.Line.EmployeeId, l.Line.EmployeeName, l.Line.Pan, l.BranchId, l.Line.Gross,
                l.Line.SocialSecurityTax, l.Line.IncomeTax, l.Line.SocialSecurityTax + l.Line.IncomeTax))
            .OrderBy(r => r.EmployeeName, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new SalaryTdsReportDto(
            query.BsYear, query.BsMonth, ReportLines.Label(query.BsYear, query.BsMonth), rows,
            rows.Sum(r => r.Gross), rows.Sum(r => r.SocialSecurityTax), rows.Sum(r => r.IncomeTax), rows.Sum(r => r.Tds));
    }
}

internal static class ReportLines
{
    public sealed record ReportLine(Guid BranchId, PayrollRunLine Line);

    public static async Task<List<ReportLine>> LoadAsync(
        PayrollDbContext dbContext, int bsYear, int bsMonth, Guid? branchId, CancellationToken cancellationToken)
    {
        var runs = dbContext.Runs.AsNoTracking()
            .Where(r => r.BsYear == bsYear && r.BsMonth == bsMonth
                        && (r.Status == PayrollRunStatuses.Posted || r.Status == PayrollRunStatuses.Paid));
        if (branchId is { } branch)
        {
            runs = runs.Where(r => r.BranchId == branch);
        }

        return await (
                from line in dbContext.RunLines.AsNoTracking()
                join run in runs on line.RunId equals run.Id
                select new ReportLine(run.BranchId, line))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
    }

    public static string Label(int bsYear, int bsMonth) =>
        $"{NepaliMonth.MonthName(bsMonth)} {bsYear.ToString(System.Globalization.CultureInfo.InvariantCulture)}";
}

public sealed class GetSsfReportQueryValidator : AbstractValidator<GetSsfReportQuery>
{
    public GetSsfReportQueryValidator()
    {
        RuleFor(x => x.BsMonth).InclusiveBetween(1, 12);
        RuleFor(x => x.BsYear).InclusiveBetween(2000, 2200);
    }
}

public sealed class GetSalaryTdsReportQueryValidator : AbstractValidator<GetSalaryTdsReportQuery>
{
    public GetSalaryTdsReportQueryValidator()
    {
        RuleFor(x => x.BsMonth).InclusiveBetween(1, 12);
        RuleFor(x => x.BsYear).InclusiveBetween(2000, 2200);
    }
}
