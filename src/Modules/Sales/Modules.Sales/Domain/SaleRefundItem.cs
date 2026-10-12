using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Sales.Domain;

/// <summary>
/// One refunded line against a specific original <see cref="SaleItem"/>. Reached ONLY through
/// <see cref="SaleRefund"/>'s navigation collection — needs <c>ValueGeneratedNever()</c> in its EF
/// config (database.md nav-child footgun).
/// </summary>
public sealed class SaleRefundItem : BaseEntity<Guid>
{
    public Guid SaleRefundId { get; private set; }
    public Guid SaleItemId { get; private set; }
    public Guid MedicineId { get; private set; }
    public decimal QuantityRefunded { get; private set; }
    /// <summary>What the customer paid per unit on the sale line, after its discount
    /// (<see cref="SaleItem.PaidUnitPrice"/>). Older refunds hold the pre-discount price.</summary>
    public decimal UnitPrice { get; private set; }

    public decimal TotalRefundAmount => Math.Round(QuantityRefunded * UnitPrice, 2, MidpointRounding.AwayFromZero);

    private SaleRefundItem() { }

    internal static SaleRefundItem Create(Guid saleItemId, Guid medicineId, decimal quantityRefunded, decimal unitPrice)
    {
        if (quantityRefunded <= 0)
        {
            throw new CustomException("Quantity refunded must be positive.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        if (unitPrice < 0)
        {
            throw new CustomException("Unit price cannot be negative.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        return new SaleRefundItem
        {
            Id = Guid.CreateVersion7(),
            SaleItemId = saleItemId,
            MedicineId = medicineId,
            QuantityRefunded = quantityRefunded,
            UnitPrice = unitPrice,
        };
    }

    internal void AssignRefund(Guid saleRefundId) => SaleRefundId = saleRefundId;
}
