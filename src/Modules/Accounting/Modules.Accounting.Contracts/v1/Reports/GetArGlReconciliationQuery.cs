using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Reports;

/// <summary>Compares Customers' total AR balance (current, not historical — see
/// <see cref="Dtos.GlReconciliationDto"/>) against the Accounts Receivable GL account's current
/// balance, optionally for one branch (<paramref name="BranchId"/>; null = every branch the caller
/// may see).</summary>
public sealed record GetArGlReconciliationQuery(Guid? BranchId = null) : IQuery<GlReconciliationDto>;
