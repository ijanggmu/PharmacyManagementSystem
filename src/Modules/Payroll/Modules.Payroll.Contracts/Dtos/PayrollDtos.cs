namespace FSH.Modules.Payroll.Contracts.Dtos;

/// <summary>Marital status values, as the tax slabs use them (a married individual may elect couple slabs).</summary>
public static class PayrollMaritalStatus
{
    public const string SinglePerson = "Single";
    public const string Married = "Married";

    public static bool IsValid(string? value) => value is SinglePerson or Married;
}

/// <summary>Payroll run statuses, in lifecycle order: Draft → Approved → Posted → Paid.</summary>
public static class PayrollRunStatuses
{
    public const string Draft = "Draft";
    public const string Approved = "Approved";
    public const string Posted = "Posted";
    public const string Paid = "Paid";
}

public sealed record SalaryStructureDto(
    Guid Id,
    Guid EmployeeId,
    DateOnly EffectiveFrom,
    decimal Basic,
    decimal Grade,
    decimal DearnessAllowance,
    decimal OtherAllowance,
    decimal OtherDeduction,
    decimal CitContribution,
    string? Notes,
    decimal Gross,
    DateTime CreatedAtUtc);

public sealed record EmployeeDto(
    Guid Id,
    string FullName,
    Guid BranchId,
    string? Designation,
    DateOnly JoiningDate,
    string? Pan,
    string? SsfNumber,
    bool SsfEnrolled,
    string? BankName,
    string? BankAccountNumber,
    string MaritalStatus,
    bool IsActive,
    Guid? UserId,
    SalaryStructureDto? CurrentSalary,
    DateTime CreatedAtUtc);

/// <summary>
/// Tenant payroll settings. <see cref="EmployeeSsfRatePercent"/> / <see cref="EmployerSsfRatePercent"/> default to the
/// Social Security Fund contribution of 11% + 20% of basic salary (31% deposited); <see cref="RetirementDeductionCap"/>
/// to the Rs 5,00,000 yearly ceiling on deductible retirement contributions (SSF + CIT). <see cref="Note"/> reminds the
/// user to confirm both against current law; the tax slabs are listed read-only in <see cref="TaxSlabs"/>.
/// </summary>
public sealed record PayrollSettingsDto(
    decimal EmployeeSsfRatePercent,
    decimal EmployerSsfRatePercent,
    decimal RetirementDeductionCap,
    string Note,
    PayrollTaxSlabsDto TaxSlabs,
    DateTime? UpdatedAtUtc);

public sealed record PayrollTaxBandDto(decimal? UpTo, decimal RatePercent);

public sealed record PayrollTaxSlabsDto(
    string FiscalYearLabel,
    IReadOnlyList<PayrollTaxBandDto> SingleSlabs,
    IReadOnlyList<PayrollTaxBandDto> MarriedSlabs,
    string Source);

/// <summary>One employee's line in a payroll run (or preview). Money is rounded to the paisa.
/// <see cref="Tds"/> = <see cref="SocialSecurityTax"/> (1% first-slab tax; nil for SSF contributors) +
/// <see cref="IncomeTax"/>. <see cref="Net"/> = Gross − EmployeeSsf − Cit − Tds − OtherDeduction.</summary>
public sealed record PayrollRunLineDto(
    Guid EmployeeId,
    string EmployeeName,
    string? Designation,
    string? Pan,
    string? SsfNumber,
    string? BankName,
    string? BankAccountNumber,
    string MaritalStatus,
    bool SsfEnrolled,
    int DaysWorked,
    int DaysInMonth,
    decimal Basic,
    decimal Grade,
    decimal DearnessAllowance,
    decimal OtherAllowance,
    decimal Gross,
    decimal EmployeeSsf,
    decimal EmployerSsf,
    decimal Cit,
    decimal OtherDeduction,
    decimal SocialSecurityTax,
    decimal IncomeTax,
    decimal Tds,
    decimal Net,
    decimal ProjectedAnnualIncome,
    decimal AnnualTaxableIncome,
    decimal AnnualTax);

public sealed record PayrollTotalsDto(
    int EmployeeCount,
    decimal Gross,
    decimal EmployeeSsf,
    decimal EmployerSsf,
    decimal Cit,
    decimal OtherDeductions,
    decimal SocialSecurityTax,
    decimal IncomeTax,
    decimal Tds,
    decimal Net);

public sealed record PayrollSkippedEmployeeDto(Guid EmployeeId, string EmployeeName, string Reason);

public sealed record PayrollPreviewDto(
    Guid BranchId,
    int BsYear,
    int BsMonth,
    string PeriodLabel,
    string FiscalYearLabel,
    DateOnly PeriodStart,
    DateOnly PeriodEnd,
    PayrollTotalsDto Totals,
    IReadOnlyList<PayrollRunLineDto> Lines,
    IReadOnlyList<PayrollSkippedEmployeeDto> Skipped);

public sealed record PayrollRunDto(
    Guid Id,
    Guid BranchId,
    int BsYear,
    int BsMonth,
    string PeriodLabel,
    string FiscalYearLabel,
    DateOnly PeriodStart,
    DateOnly PeriodEnd,
    string Status,
    PayrollTotalsDto Totals,
    string? PreparedBy,
    string? ApprovedBy,
    DateTime? ApprovedAtUtc,
    string? PostedBy,
    DateTime? PostedAtUtc,
    DateOnly? PostingDate,
    string? PaidBy,
    DateTime? PaidAtUtc,
    DateOnly? PaidOn,
    string? PaymentMethod,
    DateTime CreatedAtUtc,
    IReadOnlyList<PayrollRunLineDto> Lines);

/// <summary>Monthly SSF contribution report row: 11% employee + 20% employer of basic (per settings).</summary>
public sealed record SsfReportRowDto(
    Guid EmployeeId,
    string EmployeeName,
    string? SsfNumber,
    Guid BranchId,
    decimal Basic,
    decimal EmployeeSsf,
    decimal EmployerSsf,
    decimal Total);

public sealed record SsfReportDto(
    int BsYear,
    int BsMonth,
    string PeriodLabel,
    IReadOnlyList<SsfReportRowDto> Rows,
    decimal TotalBasic,
    decimal TotalEmployeeSsf,
    decimal TotalEmployerSsf,
    decimal Total);

/// <summary>Monthly salary TDS report row: the 1% social security tax and the income tax withheld.</summary>
public sealed record SalaryTdsReportRowDto(
    Guid EmployeeId,
    string EmployeeName,
    string? Pan,
    Guid BranchId,
    decimal Gross,
    decimal SocialSecurityTax,
    decimal IncomeTax,
    decimal Tds);

public sealed record SalaryTdsReportDto(
    int BsYear,
    int BsMonth,
    string PeriodLabel,
    IReadOnlyList<SalaryTdsReportRowDto> Rows,
    decimal TotalGross,
    decimal TotalSocialSecurityTax,
    decimal TotalIncomeTax,
    decimal TotalTds);
