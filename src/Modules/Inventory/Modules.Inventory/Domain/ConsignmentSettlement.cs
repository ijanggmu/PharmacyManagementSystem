using FSH.Framework.Core.Domain;

namespace FSH.Modules.Inventory.Domain;

/// <summary>
/// One settlement run for a supplier's consignment positions — the amount the pharmacy now owes for
/// consigned stock sold since the last settlement. Posts to the supplier's AP ledger and the GL via
/// <c>ConsignmentSettledIntegrationEvent</c> (Outbox), mirroring how <c>PurchaseOrderReceivedIntegrationEvent</c>
/// drives the same two consumers for a normal purchase.
/// </summary>
public sealed class ConsignmentSettlement : AggregateRoot<Guid>
{
    public Guid SupplierId { get; private set; }

    /// <summary>Nullable — NULL means legacy/tenant-wide, per docs/branch-scoping-plan.md's
    /// ledger/reporting-entity rule. Sourced via <c>ICurrentBranch.GetBranchIdAsync()</c> in
    /// <c>SettleConsignmentCommandHandler</c>.</summary>
    public Guid? BranchId { get; private set; }
    public decimal TotalAmount { get; private set; }
    public int PositionsSettledCount { get; private set; }
    public DateTime SettlementDateUtc { get; private set; }
    public string SettledBy { get; private set; } = default!;
    public DateTime CreatedAtUtc { get; private set; }

    private ConsignmentSettlement() { }

    public static ConsignmentSettlement Create(
        Guid supplierId, decimal totalAmount, int positionsSettledCount, DateTime settlementDateUtc, string settledBy,
        Guid? branchId = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(settledBy);
        if (totalAmount <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(totalAmount), "Settlement total must be positive.");
        }

        return new ConsignmentSettlement
        {
            Id = Guid.CreateVersion7(),
            SupplierId = supplierId,
            BranchId = branchId,
            TotalAmount = totalAmount,
            PositionsSettledCount = positionsSettledCount,
            SettlementDateUtc = settlementDateUtc,
            SettledBy = settledBy.Trim(),
            CreatedAtUtc = DateTime.UtcNow,
        };
    }
}
