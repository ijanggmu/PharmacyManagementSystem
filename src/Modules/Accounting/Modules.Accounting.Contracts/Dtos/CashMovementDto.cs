namespace FSH.Modules.Accounting.Contracts.Dtos;

/// <summary>Summary cash-flow for the Cash + Bank accounts combined over a period — not a
/// day-by-day ledger, just the reconciling totals.</summary>
public sealed record CashMovementDto(
    DateTime FromUtc,
    DateTime ToUtc,
    decimal OpeningBalance,
    decimal TotalInflow,
    decimal TotalOutflow,
    decimal ClosingBalance);
