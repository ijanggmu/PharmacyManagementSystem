using FSH.Framework.Core.Domain;

namespace FSH.Modules.Purchasing.Domain;

/// <summary>
/// Reached ONLY through <see cref="PurchaseOrder"/>'s navigation collection — needs
/// <c>ValueGeneratedNever()</c> in its EF config (database.md nav-child footgun).
/// <see cref="BatchNo"/>, <see cref="ExpiryDate"/> and <see cref="SellingPrice"/> may be null until
/// the goods are received; receipt must fill them before stock can flow.
/// </summary>
public sealed class PurchaseOrderLine : BaseEntity<Guid>
{
    public Guid PurchaseOrderId { get; private set; }
    public Guid MedicineId { get; private set; }
    public string? BatchNo { get; private set; }
    public DateOnly? ExpiryDate { get; private set; }
    public decimal Quantity { get; private set; }
    public decimal UnitCostPrice { get; private set; }
    public decimal? SellingPrice { get; private set; }
    public string? RackLocation { get; private set; }
    public decimal VatAmount { get; private set; }

    private PurchaseOrderLine() { }

    internal static PurchaseOrderLine Create(
        Guid medicineId, string? batchNo, DateOnly? expiryDate, decimal quantity,
        decimal unitCostPrice, decimal? sellingPrice, string? rackLocation, decimal vatAmount)
    {
        return new PurchaseOrderLine
        {
            Id = Guid.CreateVersion7(),
            MedicineId = medicineId,
            BatchNo = Normalize(batchNo),
            ExpiryDate = expiryDate,
            Quantity = quantity,
            UnitCostPrice = unitCostPrice,
            SellingPrice = sellingPrice,
            RackLocation = rackLocation?.Trim(),
            VatAmount = vatAmount,
        };
    }

    internal void AssignOrder(Guid purchaseOrderId) => PurchaseOrderId = purchaseOrderId;

    /// <summary>
    /// Cuts the line down to the quantity actually delivered and returns what was not delivered. Line VAT
    /// is split in proportion (rounded to 2 dp on the received part; the remainder goes to the shortfall),
    /// so received + shortfall VAT always equals the original line VAT.
    /// </summary>
    internal PurchaseOrderShortfall ReduceTo(decimal receivedQuantity)
    {
        decimal shortQuantity = Quantity - receivedQuantity;
        decimal receivedVat = Quantity == 0m
            ? 0m
            : Math.Round(VatAmount * receivedQuantity / Quantity, 2, MidpointRounding.AwayFromZero);
        var shortfall = new PurchaseOrderShortfall(
            MedicineId, shortQuantity, UnitCostPrice, SellingPrice, RackLocation, VatAmount - receivedVat);

        Quantity = receivedQuantity;
        VatAmount = receivedVat;
        return shortfall;
    }

    /// <summary>Fills only the details this line does not already have. Values already set at order time win.</summary>
    internal void FillMissingDetails(string? batchNo, DateOnly? expiryDate, decimal? sellingPrice)
    {
        BatchNo ??= Normalize(batchNo);
        ExpiryDate ??= expiryDate;
        SellingPrice ??= sellingPrice;
    }

    /// <summary>Names of the batch details still missing on this line (empty when it is receivable).</summary>
    internal IReadOnlyList<string> MissingReceiptDetails()
    {
        var missing = new List<string>(3);
        if (string.IsNullOrWhiteSpace(BatchNo))
        {
            missing.Add("batch number");
        }

        if (ExpiryDate is null)
        {
            missing.Add("expiry date");
        }

        if (SellingPrice is null)
        {
            missing.Add("selling price");
        }

        return missing;
    }

    internal static string? Normalize(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

/// <summary>The part of an order line that was not delivered on a short receipt.</summary>
public sealed record PurchaseOrderShortfall(
    Guid MedicineId,
    decimal Quantity,
    decimal UnitCostPrice,
    decimal? SellingPrice,
    string? RackLocation,
    decimal VatAmount);
