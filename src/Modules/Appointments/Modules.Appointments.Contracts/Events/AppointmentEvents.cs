using FSH.Framework.Eventing.Abstractions;

namespace FSH.Modules.Appointments.Contracts.Events;

/// <summary>
/// Raised (through the outbox) when a consultation fee is taken. Accounting books a receipt: Dr the money account
/// <see cref="PaymentMethod"/> maps to <see cref="Amount"/> / Cr Consultation Fee Income (the pharmacy's part) / Cr Doctor
/// Fees Payable (<see cref="DoctorShare"/>). Idempotent on <see cref="AppointmentId"/>.
/// </summary>
public sealed record ConsultationFeeCollectedIntegrationEvent(
    Guid Id,
    DateTime OccurredOnUtc,
    string? TenantId,
    string CorrelationId,
    string Source,
    Guid AppointmentId,
    Guid BranchId,
    string DoctorName,
    string PatientName,
    int TokenNo,
    decimal Amount,
    decimal DoctorShare,
    string PaymentMethod,
    DateTime PaidOnUtc) : IIntegrationEvent;

/// <summary>Raised when a cancelled visit's fee is given back. Accounting reverses the fee's receipt.</summary>
public sealed record ConsultationFeeRefundedIntegrationEvent(
    Guid Id,
    DateTime OccurredOnUtc,
    string? TenantId,
    string CorrelationId,
    string Source,
    Guid AppointmentId,
    Guid BranchId,
    string Reason,
    DateTime RefundedOnUtc) : IIntegrationEvent;

/// <summary>Raised when a doctor is paid their share. Accounting books a payment: Dr Doctor Fees Payable / Cr the money
/// account <see cref="PaymentMethod"/> maps to. Idempotent on <see cref="PayoutId"/>.</summary>
public sealed record DoctorPayoutPaidIntegrationEvent(
    Guid Id,
    DateTime OccurredOnUtc,
    string? TenantId,
    string CorrelationId,
    string Source,
    Guid PayoutId,
    Guid? BranchId,
    string DoctorName,
    decimal Amount,
    string PaymentMethod,
    DateTime PaidOnUtc) : IIntegrationEvent;
