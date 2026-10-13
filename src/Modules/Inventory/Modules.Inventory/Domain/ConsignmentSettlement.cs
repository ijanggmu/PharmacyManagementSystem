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
    /// <summary>Net of VAT: the consigned lots' cost of the units sold.</summary>
    public decimal TotalAmount { get; private set; }

    /// <summary>Input VAT the supplier bills on the taxable lots settled (0 when the supplier's bill
    /// carries no VAT). The supplier is owed <see cref="TotalAmount"/> + this.</summary>
    public decimal VatAmount { get; private set; }
    public int PositionsSettledCount { get; private set; }
    public DateTime SettlementDateUtc { get; private set; }
    public string SettledBy { get; private set; } = default!;
    public DateTime CreatedAtUtc { get; private set; }

    private ConsignmentSettlement() { }

    public static ConsignmentSettlement Create(
        Guid supplierId, decimal totalAmount, int positionsSettledCount, DateTime settlementDateUtc, string settledBy,
        Guid? branchId = null, decimal vatAmount = 0m)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(settledBy);
        // Zero is allowed: units sold from a lot consigned at no cost are still settled, just owed nothing.
        if (totalAmount < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(totalAmount), "Settlement total can't be negative.");
        }

        if (vatAmount < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(vatAmount), "Settlement VAT can't be negative.");
        }

        return new ConsignmentSettlement
        {
            Id = Guid.CreateVersion7(),
            SupplierId = supplierId,
            BranchId = branchId,
            TotalAmount = totalAmount,
            VatAmount = vatAmount,
            PositionsSettledCount = positionsSettledCount,
            SettlementDateUtc = settlementDateUtc,
            SettledBy = settledBy.Trim(),
            CreatedAtUtc = DateTime.UtcNow,
        };
    }
}
