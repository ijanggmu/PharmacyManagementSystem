using FSH.Framework.Eventing.Abstractions;

namespace FSH.Modules.Payroll.Contracts.Events;

/// <summary>
/// Raised (through the outbox) when a posted payroll run is recorded as paid. Accounting books the payment voucher
/// (PMT): Dr Salaries Payable / Cr the money account <see cref="PaymentMethod"/> maps to. Idempotent on
/// <see cref="RunId"/>. <see cref="Amount"/> is the run's total net pay.
/// </summary>
public sealed record PayrollRunPaidIntegrationEvent(
    Guid Id,
    DateTime OccurredOnUtc,
    string? TenantId,
    string CorrelationId,
    string Source,
    Guid RunId,
    Guid BranchId,
    string PeriodLabel,
    decimal Amount,
    string PaymentMethod,
    DateTime PaidOnUtc) : IIntegrationEvent;
