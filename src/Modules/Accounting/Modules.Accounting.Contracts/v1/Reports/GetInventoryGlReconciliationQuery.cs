using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Reports;

/// <summary>Compares Inventory's current stock valuation against the Inventory GL account's current
/// balance, optionally for one branch (<paramref name="BranchId"/>; null = every branch the caller
/// may see).</summary>
public sealed record GetInventoryGlReconciliationQuery(Guid? BranchId = null) : IQuery<GlReconciliationDto>;
