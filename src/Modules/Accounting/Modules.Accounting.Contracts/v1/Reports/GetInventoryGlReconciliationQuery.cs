using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Reports;

/// <summary>Compares Inventory's current stock valuation against the Inventory GL account's current
/// balance, optionally for one branch (<paramref name="BranchId"/>; null = every branch the caller
/// may see).</summary>
/// <remarks><paramref name="AsOfUtc"/> limits the GL side to vouchers dated on or before it (null = now).
/// The stock valuation subledger has no history, so it is always the current valuation — the DTO's
/// <c>SubledgerAsOfUtc</c> says so.</remarks>
public sealed record GetInventoryGlReconciliationQuery(Guid? BranchId = null, DateTime? AsOfUtc = null) : IQuery<GlReconciliationDto>;
