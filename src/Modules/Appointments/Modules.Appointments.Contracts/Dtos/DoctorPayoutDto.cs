namespace FSH.Modules.Appointments.Contracts.Dtos;

/// <summary>What the pharmacy owes a doctor now: the doctor's share of every paid, not-cancelled visit that no payout
/// covers yet.</summary>
public sealed record DoctorBalanceDto(
    Guid DoctorId,
    string DoctorName,
    decimal AmountOwed,
    int VisitCount,
    decimal FeesCollected,
    DateOnly? OldestVisitDate);

public sealed record DoctorPayoutDto(
    Guid Id,
    Guid DoctorId,
    string DoctorName,
    Guid? BranchId,
    decimal Amount,
    int VisitCount,
    string PaymentMethod,
    string? Note,
    DateTime PaidAtUtc,
    string? PaidBy);
