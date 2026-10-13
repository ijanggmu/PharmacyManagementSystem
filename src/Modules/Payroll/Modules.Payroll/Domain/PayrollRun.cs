using FSH.Framework.Core.Domain;
using FSH.Modules.Payroll.Contracts.Dtos;

namespace FSH.Modules.Payroll.Domain;

/// <summary>
/// One branch's payroll for one Nepali month. Lifecycle: <c>Draft</c> (computed, editable by recalculation or delete)
/// → <c>Approved</c> → <c>Posted</c> (accrual journal booked in Accounting) → <c>Paid</c> (payment voucher booked).
/// One run per branch and month. Lines are snapshots — later edits to an employee or structure don't rewrite them.
/// </summary>
public sealed class PayrollRun : AggregateRoot<Guid>
{
    public const int UserMaxLength = 256;
    public const int PaymentMethodMaxLength = 32;

    private readonly List<PayrollRunLine> _lines = [];

    public Guid BranchId { get; private set; }
    public int BsYear { get; private set; }
    public int BsMonth { get; private set; }
    public int FiscalYearStart { get; private set; }
    public int MonthOfFiscalYear { get; private set; }
    public DateOnly PeriodStart { get; private set; }
    public DateOnly PeriodEnd { get; private set; }
    public string Status { get; private set; } = PayrollRunStatuses.Draft;

    public decimal TotalGross { get; private set; }
    public decimal TotalEmployeeSsf { get; private set; }
    public decimal TotalEmployerSsf { get; private set; }
    public decimal TotalCit { get; private set; }
    public decimal TotalOtherDeductions { get; private set; }
    public decimal TotalSocialSecurityTax { get; private set; }
    public decimal TotalIncomeTax { get; private set; }
    public decimal TotalNet { get; private set; }

    public string? PreparedBy { get; private set; }
    public string? ApprovedBy { get; private set; }
    public DateTime? ApprovedAtUtc { get; private set; }
    public string? PostedBy { get; private set; }
    public DateTime? PostedAtUtc { get; private set; }
    public DateOnly? PostingDate { get; private set; }
    public string? PaidBy { get; private set; }
    public DateTime? PaidAtUtc { get; private set; }
    public DateOnly? PaidOn { get; private set; }
    public string? PaymentMethod { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? UpdatedAtUtc { get; private set; }

    public IReadOnlyCollection<PayrollRunLine> Lines => _lines;

    public decimal TotalTds => TotalSocialSecurityTax + TotalIncomeTax;

    private PayrollRun() { }

    public static PayrollRun CreateDraft(Guid branchId, NepaliMonth month, string? preparedBy, DateTime nowUtc)
    {
        ArgumentNullException.ThrowIfNull(month);
        return new PayrollRun
        {
            Id = Guid.CreateVersion7(),
            BranchId = branchId,
            BsYear = month.BsYear,
            BsMonth = month.BsMonth,
            FiscalYearStart = month.FiscalYearStart,
            MonthOfFiscalYear = month.MonthOfFiscalYear,
            PeriodStart = month.Start,
            PeriodEnd = month.End,
            PreparedBy = preparedBy,
            CreatedAtUtc = nowUtc,
        };
    }

    /// <summary>Replaces a draft's lines (create / recalculate) and recomputes the totals.</summary>
    public void ReplaceLines(IEnumerable<PayrollRunLine> lines, DateTime nowUtc)
    {
        ArgumentNullException.ThrowIfNull(lines);
        EnsureStatus(PayrollRunStatuses.Draft, "recalculated");
        _lines.Clear();
        _lines.AddRange(lines);
        TotalGross = _lines.Sum(l => l.Gross);
        TotalEmployeeSsf = _lines.Sum(l => l.EmployeeSsf);
        TotalEmployerSsf = _lines.Sum(l => l.EmployerSsf);
        TotalCit = _lines.Sum(l => l.Cit);
        TotalOtherDeductions = _lines.Sum(l => l.OtherDeduction);
        TotalSocialSecurityTax = _lines.Sum(l => l.SocialSecurityTax);
        TotalIncomeTax = _lines.Sum(l => l.IncomeTax);
        TotalNet = _lines.Sum(l => l.Net);
        UpdatedAtUtc = nowUtc;
    }

    public void Approve(string? by, DateTime nowUtc)
    {
        EnsureStatus(PayrollRunStatuses.Draft, "approved");
        if (_lines.Count == 0)
        {
            throw new InvalidOperationException("A payroll run with no employees can't be approved.");
        }

        Status = PayrollRunStatuses.Approved;
        ApprovedBy = by;
        ApprovedAtUtc = nowUtc;
        UpdatedAtUtc = nowUtc;
    }

    public void Post(DateOnly postingDate, string? by, DateTime nowUtc)
    {
        EnsureStatus(PayrollRunStatuses.Approved, "posted");
        Status = PayrollRunStatuses.Posted;
        PostingDate = postingDate;
        PostedBy = by;
        PostedAtUtc = nowUtc;
        UpdatedAtUtc = nowUtc;
    }

    public void MarkPaid(string paymentMethod, DateOnly paidOn, string? by, DateTime nowUtc)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(paymentMethod);
        EnsureStatus(PayrollRunStatuses.Posted, "paid");
        Status = PayrollRunStatuses.Paid;
        PaymentMethod = paymentMethod.Trim();
        PaidOn = paidOn;
        PaidBy = by;
        PaidAtUtc = nowUtc;
        UpdatedAtUtc = nowUtc;
    }

    /// <summary>Whether the run's figures count as withheld / paid for later months' year-to-date.</summary>
    public static bool IsRecorded(string status) =>
        status is PayrollRunStatuses.Approved or PayrollRunStatuses.Posted or PayrollRunStatuses.Paid;

    private void EnsureStatus(string expected, string action)
    {
        if (Status != expected)
        {
            throw new InvalidOperationException($"Only a payroll run in status {expected} can be {action}; this one is {Status}.");
        }
    }
}

/// <summary>One employee's computed pay in a <see cref="PayrollRun"/> — a snapshot of the employee and the result.</summary>
public sealed class PayrollRunLine : BaseEntity<Guid>
{
    public Guid RunId { get; private set; }
    public Guid EmployeeId { get; private set; }
    public string EmployeeName { get; private set; } = default!;
    public string? Designation { get; private set; }
    public string? Pan { get; private set; }
    public string? SsfNumber { get; private set; }
    public string? BankName { get; private set; }
    public string? BankAccountNumber { get; private set; }
    public string MaritalStatus { get; private set; } = PayrollMaritalStatus.SinglePerson;
    public bool SsfEnrolled { get; private set; }
    public int DaysWorked { get; private set; }
    public int DaysInMonth { get; private set; }
    public decimal Basic { get; private set; }
    public decimal Grade { get; private set; }
    public decimal DearnessAllowance { get; private set; }
    public decimal OtherAllowance { get; private set; }
    public decimal Gross { get; private set; }
    public decimal EmployeeSsf { get; private set; }
    public decimal EmployerSsf { get; private set; }
    public decimal Cit { get; private set; }
    public decimal OtherDeduction { get; private set; }
    public decimal SocialSecurityTax { get; private set; }
    public decimal IncomeTax { get; private set; }
    public decimal Net { get; private set; }
    public decimal ProjectedAnnualIncome { get; private set; }
    public decimal AnnualTaxableIncome { get; private set; }
    public decimal AnnualTax { get; private set; }

    /// <summary>Assessable income this month (gross + employer SSF) — the year-to-date input for later months.</summary>
    public decimal AssessableIncome { get; private set; }

    /// <summary>Retirement contributions this month (SSF both sides + CIT) — the year-to-date input for later months.</summary>
    public decimal RetirementContribution { get; private set; }

    public decimal Tds => SocialSecurityTax + IncomeTax;

    private PayrollRunLine() { }

    public static PayrollRunLine Create(Guid runId, Employee employee, int daysWorked, int daysInMonth, PayrollLineResult r)
    {
        ArgumentNullException.ThrowIfNull(employee);
        ArgumentNullException.ThrowIfNull(r);
        return new PayrollRunLine
        {
            Id = Guid.CreateVersion7(),
            RunId = runId,
            EmployeeId = employee.Id,
            EmployeeName = employee.FullName,
            Designation = employee.Designation,
            Pan = employee.Pan,
            SsfNumber = employee.SsfNumber,
            BankName = employee.BankName,
            BankAccountNumber = employee.BankAccountNumber,
            MaritalStatus = employee.MaritalStatus,
            SsfEnrolled = employee.SsfEnrolled,
            DaysWorked = daysWorked,
            DaysInMonth = daysInMonth,
            Basic = r.Basic,
            Grade = r.Grade,
            DearnessAllowance = r.DearnessAllowance,
            OtherAllowance = r.OtherAllowance,
            Gross = r.Gross,
            EmployeeSsf = r.EmployeeSsf,
            EmployerSsf = r.EmployerSsf,
            Cit = r.Cit,
            OtherDeduction = r.OtherDeduction,
            SocialSecurityTax = r.SocialSecurityTax,
            IncomeTax = r.IncomeTax,
            Net = r.Net,
            ProjectedAnnualIncome = r.ProjectedAnnualIncome,
            AnnualTaxableIncome = r.AnnualTaxableIncome,
            AnnualTax = r.AnnualTax,
            AssessableIncome = r.IncomeThisMonth,
            RetirementContribution = r.RetirementThisMonth,
        };
    }
}
