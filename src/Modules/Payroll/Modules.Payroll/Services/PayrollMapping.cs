using FSH.Modules.Payroll.Contracts.Dtos;
using FSH.Modules.Payroll.Domain;

namespace FSH.Modules.Payroll.Services;

internal static class PayrollMapping
{
    public static SalaryStructureDto ToDto(this SalaryStructure s) =>
        new(s.Id, s.EmployeeId, s.EffectiveFrom, s.Basic, s.Grade, s.DearnessAllowance, s.OtherAllowance,
            s.OtherDeduction, s.CitContribution, s.Notes, s.Gross, s.CreatedAtUtc);

    public static EmployeeDto ToDto(this Employee e, SalaryStructure? current) =>
        new(e.Id, e.FullName, e.BranchId, e.Designation, e.JoiningDate, e.Pan, e.SsfNumber, e.SsfEnrolled, e.BankName,
            e.BankAccountNumber, e.MaritalStatus, e.IsActive, e.UserId, current?.ToDto(), e.CreatedAtUtc);

    public static PayrollRunLineDto ToDto(this PayrollRunLine l) =>
        new(l.EmployeeId, l.EmployeeName, l.Designation, l.Pan, l.SsfNumber, l.BankName, l.BankAccountNumber,
            l.MaritalStatus, l.SsfEnrolled, l.DaysWorked, l.DaysInMonth, l.Basic, l.Grade, l.DearnessAllowance,
            l.OtherAllowance, l.Gross, l.EmployeeSsf, l.EmployerSsf, l.Cit, l.OtherDeduction, l.SocialSecurityTax,
            l.IncomeTax, l.Tds, l.Net, l.ProjectedAnnualIncome, l.AnnualTaxableIncome, l.AnnualTax);

    public static PayrollRunDto ToDto(this PayrollRun r, bool includeLines, int? employeeCount = null)
    {
        var month = new NepaliMonth(r.BsYear, r.BsMonth, r.PeriodStart, r.PeriodEnd);
        var totals = new PayrollTotalsDto(
            employeeCount ?? r.Lines.Count, r.TotalGross, r.TotalEmployeeSsf, r.TotalEmployerSsf, r.TotalCit,
            r.TotalOtherDeductions, r.TotalSocialSecurityTax, r.TotalIncomeTax, r.TotalTds, r.TotalNet);
        IReadOnlyList<PayrollRunLineDto> lines = includeLines
            ? r.Lines.OrderBy(l => l.EmployeeName, StringComparer.OrdinalIgnoreCase).Select(l => l.ToDto()).ToList()
            : [];
        return new PayrollRunDto(
            r.Id, r.BranchId, r.BsYear, r.BsMonth, month.Label, month.FiscalYearLabel, r.PeriodStart, r.PeriodEnd,
            r.Status, totals, r.PreparedBy, r.ApprovedBy, r.ApprovedAtUtc, r.PostedBy, r.PostedAtUtc, r.PostingDate,
            r.PaidBy, r.PaidAtUtc, r.PaidOn, r.PaymentMethod, r.CreatedAtUtc, lines);
    }

    public static PayrollTotalsDto Totals(IReadOnlyCollection<PayrollRunLine> lines) =>
        new(lines.Count,
            lines.Sum(l => l.Gross),
            lines.Sum(l => l.EmployeeSsf),
            lines.Sum(l => l.EmployerSsf),
            lines.Sum(l => l.Cit),
            lines.Sum(l => l.OtherDeduction),
            lines.Sum(l => l.SocialSecurityTax),
            lines.Sum(l => l.IncomeTax),
            lines.Sum(l => l.Tds),
            lines.Sum(l => l.Net));
}
