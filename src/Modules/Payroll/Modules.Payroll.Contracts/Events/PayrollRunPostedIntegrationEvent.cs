using FSH.Framework.Eventing.Abstractions;

namespace FSH.Modules.Payroll.Contracts.Events;

/// <summary>
/// Raised (through the outbox, in the same transaction) when an approved payroll run is posted. Accounting books the
/// accrual journal (JV): Dr Salary Expense (gross) + Dr Employer SSF Expense / Cr Salaries Payable (net),
/// SSF Payable (employee + employer SSF), Salary TDS Payable, CIT Payable and Other Payroll Deductions Payable.
/// Idempotent on <see cref="RunId"/>. Every total is rounded to the paisa and the lines balance by construction:
/// <c>Gross + EmployerSsf = Net + EmployeeSsf + EmployerSsf + Tds + Cit + OtherDeductions</c>.
/// Carries totals only — no employee names or individual salaries.
/// </summary>
public sealed record PayrollRunPostedIntegrationEvent(
    Guid Id,
    DateTime OccurredOnUtc,
    string? TenantId,
    string CorrelationId,
    string Source,
    Guid RunId,
    Guid BranchId,
    string PeriodLabel,
    DateTime PostingDateUtc,
    decimal TotalGross,
    decimal TotalEmployeeSsf,
    decimal TotalEmployerSsf,
    decimal TotalCit,
    decimal TotalTds,
    decimal TotalOtherDeductions,
    decimal TotalNet) : IIntegrationEvent;
