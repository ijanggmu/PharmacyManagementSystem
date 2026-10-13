using FSH.Framework.Eventing.Abstractions;

namespace FSH.Modules.Sales.Contracts.Events;

/// <summary>
/// Raised when a <c>CashShift</c> is closed and the cash counted in the drawer differs from the cash it was
/// expected to hold (both frozen at close). Consumed by <c>Accounting</c>, which books the difference
/// against Cash Short &amp; Over so GL Cash matches the physical drawer: a shortage
/// (<see cref="Variance"/> &lt; 0) is Dr Cash Short &amp; Over / Cr Cash, an overage the reverse.
/// Not raised for a balanced drawer. <see cref="Variance"/> = <see cref="CountedCash"/> -
/// <see cref="ExpectedCash"/>, rounded to 2 decimals; <see cref="ClosedAtUtc"/> is the business date the
/// voucher is dated on.
/// </summary>
public sealed record CashShiftClosedWithVarianceIntegrationEvent(
    Guid Id,
    DateTime OccurredOnUtc,
    string? TenantId,
    string CorrelationId,
    string Source,
    Guid CashShiftId,
    Guid BranchId,
    DateTime OpenedAtUtc,
    DateTime ClosedAtUtc,
    string ClosedBy,
    decimal ExpectedCash,
    decimal CountedCash,
    decimal Variance)
    : IIntegrationEvent;
