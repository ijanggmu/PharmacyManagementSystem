using FSH.Modules.Payroll.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Payroll.Contracts.v1;

// ---- Employees ---------------------------------------------------------------------------------------------------

/// <summary>Adds an employee to the payroll. <see cref="MaritalStatus"/> is <c>Single</c> or <c>Married</c> (picks the
/// tax slabs); <see cref="SsfEnrolled"/> turns on SSF contributions and waives the 1% social security tax.</summary>
public sealed record CreateEmployeeCommand(
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
    Guid? UserId = null) : ICommand<EmployeeDto>;

public sealed record UpdateEmployeeCommand(
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
    Guid? UserId = null) : ICommand<EmployeeDto>;

/// <summary>Employees, by name. Inactive ones only when <see cref="IncludeInactive"/>.</summary>
public sealed record ListEmployeesQuery(Guid? BranchId = null, bool IncludeInactive = false, string? Search = null)
    : IQuery<IReadOnlyList<EmployeeDto>>;

public sealed record GetEmployeeQuery(Guid Id) : IQuery<EmployeeDto>;

/// <summary>Every salary structure of an employee, newest effective date first.</summary>
public sealed record ListSalaryStructuresQuery(Guid EmployeeId) : IQuery<IReadOnlyList<SalaryStructureDto>>;

/// <summary>Adds a salary structure effective from <see cref="EffectiveFrom"/> (AD date). A run uses the latest
/// structure effective on or before its period end. Amounts are monthly; <see cref="CitContribution"/> is the
/// employee's optional monthly Citizen Investment Trust contribution.</summary>
public sealed record AddSalaryStructureCommand(
    Guid EmployeeId,
    DateOnly EffectiveFrom,
    decimal Basic,
    decimal Grade,
    decimal DearnessAllowance,
    decimal OtherAllowance,
    decimal OtherDeduction,
    decimal CitContribution,
    string? Notes) : ICommand<SalaryStructureDto>;

// ---- Settings ----------------------------------------------------------------------------------------------------

public sealed record GetPayrollSettingsQuery : IQuery<PayrollSettingsDto>;

public sealed record UpdatePayrollSettingsCommand(
    decimal EmployeeSsfRatePercent,
    decimal EmployerSsfRatePercent,
    decimal RetirementDeductionCap) : ICommand<PayrollSettingsDto>;

// ---- Runs --------------------------------------------------------------------------------------------------------

/// <summary>Computes a run for a branch and Nepali month (<see cref="BsMonth"/> 1 = Baisakh … 4 = Shrawan … 12 =
/// Chaitra) without saving anything.</summary>
public sealed record PreviewPayrollRunQuery(Guid BranchId, int BsYear, int BsMonth) : IQuery<PayrollPreviewDto>;

/// <summary>Creates a draft run for the branch and month (one run per branch and month).</summary>
public sealed record CreatePayrollRunCommand(Guid BranchId, int BsYear, int BsMonth) : ICommand<PayrollRunDto>;

/// <summary>Recomputes a draft run from the current employees, structures and settings.</summary>
public sealed record RecalculatePayrollRunCommand(Guid RunId) : ICommand<PayrollRunDto>;

/// <summary>Deletes a draft run.</summary>
public sealed record DeletePayrollRunCommand(Guid RunId) : ICommand<Unit>;

public sealed record ApprovePayrollRunCommand(Guid RunId) : ICommand<PayrollRunDto>;

/// <summary>Posts an approved run to the books, dated <see cref="PostingDate"/> (default: the period's last day).</summary>
public sealed record PostPayrollRunCommand(Guid RunId, DateOnly? PostingDate = null) : ICommand<PayrollRunDto>;

/// <summary>Records a posted run as paid by <see cref="PaymentMethod"/> (cash, bank, …) on <see cref="PaidOn"/>
/// (default: today).</summary>
public sealed record PayPayrollRunCommand(Guid RunId, string PaymentMethod, DateOnly? PaidOn = null) : ICommand<PayrollRunDto>;

/// <summary>Runs, newest period first. Without lines (see <see cref="GetPayrollRunQuery"/>).</summary>
public sealed record ListPayrollRunsQuery(Guid? BranchId = null, int? FiscalYear = null, string? Status = null)
    : IQuery<IReadOnlyList<PayrollRunDto>>;

/// <summary>A run with its lines — the payslips and the payroll register are rendered from it.</summary>
public sealed record GetPayrollRunQuery(Guid Id) : IQuery<PayrollRunDto>;

// ---- Reports -----------------------------------------------------------------------------------------------------

/// <summary>SSF contributions for the month, from posted / paid runs.</summary>
public sealed record GetSsfReportQuery(int BsYear, int BsMonth, Guid? BranchId = null) : IQuery<SsfReportDto>;

/// <summary>Salary TDS (social security tax + income tax) for the month, from posted / paid runs.</summary>
public sealed record GetSalaryTdsReportQuery(int BsYear, int BsMonth, Guid? BranchId = null) : IQuery<SalaryTdsReportDto>;
