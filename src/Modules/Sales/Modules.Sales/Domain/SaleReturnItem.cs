using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Sales.Domain;

/// <summary>
/// One returned line against a specific original <see cref="SaleItem"/>. Reached ONLY through
/// <see cref="SaleReturn"/>'s navigation collection — needs <c>ValueGeneratedNever()</c> in its EF
/// config (database.md nav-child footgun).
/// </summary>
public sealed class SaleReturnItem : BaseEntity<Guid>
{
    public Guid SaleReturnId { get; private set; }
    public Guid SaleItemId { get; private set; }
    public Guid MedicineId { get; private set; }
    public decimal QuantityReturned { get; private set; }
    public decimal UnitPrice { get; private set; }

    /// <summary>The original sale line's cost — carried so the accounting voucher can reverse COGS
    /// at actual cost (script 80's <c>v_cogs</c> computation), without Accounting needing to look up
    /// Sales' data.</summary>
    public decimal UnitCostPrice { get; private set; }

    public string Reason { get; private set; } = default!;
    public PackagingCondition PackagingCondition { get; private set; }

    public decimal TotalAmount => QuantityReturned * UnitPrice;

    private SaleReturnItem() { }

    internal static SaleReturnItem Create(
        Guid saleItemId, Guid medicineId, decimal quantityReturned, decimal unitPrice, decimal unitCostPrice,
        string reason, PackagingCondition packagingCondition)
    {
        if (quantityReturned <= 0)
        {
            throw new CustomException("Quantity returned must be positive.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        if (unitPrice < 0)
        {
            throw new CustomException("Unit price cannot be negative.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        return new SaleReturnItem
        {
            Id = Guid.CreateVersion7(),
            SaleItemId = saleItemId,
            MedicineId = medicineId,
            QuantityReturned = quantityReturned,
            UnitPrice = unitPrice,
            UnitCostPrice = unitCostPrice,
            Reason = string.IsNullOrWhiteSpace(reason) ? "Not specified" : reason.Trim(),
            PackagingCondition = packagingCondition,
        };
    }

    internal void AssignReturn(Guid saleReturnId) => SaleReturnId = saleReturnId;
}
