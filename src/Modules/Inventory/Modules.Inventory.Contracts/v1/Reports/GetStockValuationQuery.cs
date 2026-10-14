using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Reports;

/// <summary>Sum of every owned, non-disposed batch's <c>QuantityOnHand * CostPrice</c> (consigned lots are the
/// supplier's and excluded) plus stock on transfers not yet received, at the source branch and its transfer cost — current valuation
/// only (batches carry no historical snapshot), what Accounting's `inventory-gl-reconciliation`
/// report compares against the Inventory GL account. <paramref name="BranchId"/> limits it to one
/// branch's batches (null = all branches); it is passed through as-is, so the caller is responsible
/// for resolving/authorizing the branch.</summary>
public sealed record GetStockValuationQuery(Guid? BranchId = null) : IQuery<decimal>;
