namespace FSH.Modules.Sales.Contracts.Dtos;

/// <summary>
/// Returns stats — mirrors the Next.js <c>getReturnsStatsForTenant</c> response shape exactly
/// (counts by status plus the total return amount across ALL returns, no date-range filter).
/// </summary>
public sealed record ReturnsStatsDto(
    int Total,
    decimal TotalRefundAmount,
    int Pending,
    int Approved,
    int Rejected,
    int Completed);
