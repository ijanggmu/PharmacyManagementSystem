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
/// <c>OpeningFloat + CashSalesTotal</c>; <paramref name="Variance"/> is
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
    // Cash paid out of the drawer for refunds completed during the shift.
    decimal CashRefundsTotal = 0m,
    // Cash customers paid against their accounts at this branch during the shift.
    decimal CashCustomerReceiptsTotal = 0m);
