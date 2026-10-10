namespace FSH.Modules.Sales.Contracts.Dtos;

/// <summary>
/// Refunds stats — mirrors the Next.js <c>getRefundsStatsForTenant</c> response shape exactly
/// (counts by status plus the total net refund amount across ALL refunds, no date-range filter).
/// </summary>
public sealed record RefundsStatsDto(
    int Total,
    decimal TotalRefundAmount,
    int Pending,
    int Approved,
    int Rejected,
    int Completed);
