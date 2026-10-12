using Mediator;

namespace FSH.Modules.Customers.Contracts.v1.Ledger;

/// <summary>
/// Cash received from customers against their accounts at <paramref name="BranchId"/> between
/// <paramref name="FromUtc"/> and <paramref name="ToUtc"/> (when it was recorded) — what a cash drawer took in
/// besides sales. Payments recorded before the method was stored are not counted.
/// </summary>
public sealed record GetCashCustomerReceiptsQuery(Guid BranchId, DateTime FromUtc, DateTime ToUtc) : IQuery<decimal>;
