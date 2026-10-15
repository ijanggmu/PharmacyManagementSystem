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
    Guid? BranchId = null,
    // Expected drawer cash frozen when the shift closed. Null while the shift is open, and on shifts closed
    // before the figure was stored. The counted cash less this amount is the shift's variance.
    decimal? ClosingExpectedCash = null);

/// <summary>Cash reconciliation for a shift: <paramref name="ExpectedCash"/> is
/// <c>OpeningFloat + CashSalesTotal + CashReceiptsTotal - CashRefundsTotal</c> (cash customers paid on
/// account, and cash paid back out for returns/refunds completed in the window), frozen at close; <paramref name="Variance"/> is
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
    decimal CashRefundsTotal = 0m,
    decimal CashReceiptsTotal = 0m);
