using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Reports;

/// <summary>Compares Suppliers' total AP balance (current) against the Accounts Payable GL account's
/// current balance, optionally for one branch (<paramref name="BranchId"/>; null = every branch the
/// caller may see).</summary>
/// <remarks><paramref name="AsOfUtc"/> limits both sides to entries dated on or before it (null = now).</remarks>
public sealed record GetApGlReconciliationQuery(Guid? BranchId = null, DateTime? AsOfUtc = null) : IQuery<GlReconciliationDto>;
