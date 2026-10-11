namespace FSH.Modules.Sales.Contracts.Dtos;

public sealed record CashShiftDto(
    Guid Id,
    DateTime OpenedAtUtc,
    string OpenedBy,
    decimal OpeningFloat,
    DateTime? ClosedAtUtc,
    string? ClosedBy,
    decimal? ClosingCashCounted,
    string Status,
    string? Notes,
    string? ClosingNotes = null,
    // Branch whose drawer this shift is.
    Guid? BranchId = null);

/// <summary>Cash reconciliation for a shift: <paramref name="ExpectedCash"/> is
/// <c>OpeningFloat + CashSalesTotal - CashRefundsTotal</c> (cash paid back out for returns/refunds
/// completed in the window), frozen at close; <paramref name="Variance"/> is
/// <paramref name="ActualCashCounted"/> minus <paramref name="ExpectedCash"/> once the shift is
/// closed (null while still open — nothing has been counted yet).</summary>
public sealed record CashShiftSummaryDto(
    Guid CashShiftId,
    DateTime OpenedAtUtc,
    DateTime? ClosedAtUtc,
    string Status,
    decimal OpeningFloat,
    decimal CashSalesTotal,
    decimal NonCashSalesTotal,
    int SalesCount,
    decimal ExpectedCash,
    decimal? ActualCashCounted,
    decimal? Variance,
    decimal CashRefundsTotal = 0m);
