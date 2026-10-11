namespace FSH.Modules.Accounting.Contracts.Dtos;

/// <summary>Summary cash-flow for every cash and bank account combined (the <c>10xx</c> asset block) over a
/// period — not a day-by-day ledger, just the reconciling totals. Inflow/outflow are netted per voucher, so
/// money moved between the tenant's own cash and bank accounts (a bank deposit, a withdrawal) is neither
/// an inflow nor an outflow; <see cref="InternalTransfers"/> shows how much moved that way.</summary>
public sealed record CashMovementDto(
    DateTime FromUtc,
    DateTime ToUtc,
    decimal OpeningBalance,
    decimal TotalInflow,
    decimal TotalOutflow,
    decimal ClosingBalance,
    decimal InternalTransfers = 0m);
