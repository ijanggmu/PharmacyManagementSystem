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

    /// <summary>Bonus units received at no charge (the "1" of a 10+1 scheme), in base units.</summary>
    public decimal FreeQuantity { get; private set; }

    /// <summary>Trade discount percent as entered (informational when an amount was entered instead).</summary>
    public decimal DiscountPercent { get; private set; }

    /// <summary>The line's trade discount amount.</summary>
    public decimal DiscountAmount { get; private set; }

    /// <summary>This line's share of the order's bill-level (cash/trade) discount.</summary>
    public decimal BillDiscountAmount { get; private set; }

    /// <summary>Units per pack when the line was entered in packs; null when entered in base units.</summary>
    public decimal? PackSize { get; private set; }

    /// <summary>Rate per pack when the line was entered in packs.</summary>
    public decimal? PackUnitCost { get; private set; }

    /// <summary>Quantity × rate, before any discount.</summary>
    public decimal GrossAmount => PurchaseLineMath.Gross(Quantity, UnitCostPrice, PackSize, PackUnitCost);

    /// <summary>Gross less the line's own trade discount (the base the bill discount is spread on).</summary>
    public decimal DiscountedAmount => GrossAmount - DiscountAmount;

    /// <summary>Taxable value: gross less the line and bill discounts. Input VAT is charged on this.</summary>
    public decimal NetAmount => GrossAmount - DiscountAmount - BillDiscountAmount;

    /// <summary>Every unit that goes into stock: paid plus free.</summary>
    public decimal ReceivedQuantity => Quantity + FreeQuantity;

    /// <summary>Cost of each unit put into stock (free ones included): net / (quantity + free quantity).</summary>
    public decimal EffectiveUnitCost => PurchaseLineMath.EffectiveUnitCost(NetAmount, Quantity, FreeQuantity);

    private PurchaseOrderLine() { }

    internal static PurchaseOrderLine Create(
        Guid medicineId, string? batchNo, DateOnly? expiryDate, decimal quantity,
        decimal unitCostPrice, decimal? sellingPrice, string? rackLocation, decimal vatAmount,
        PurchaseLineTerms terms, decimal discountAmount)
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
            FreeQuantity = terms.FreeQuantity,
            DiscountPercent = terms.DiscountPercent,
            DiscountAmount = discountAmount,
            PackSize = terms.PackSize,
            PackUnitCost = terms.PackSize is null ? null : terms.PackUnitCost,
        };
    }

    internal void AssignOrder(Guid purchaseOrderId) => PurchaseOrderId = purchaseOrderId;

    internal void AssignBillDiscount(decimal amount) => BillDiscountAmount = amount;

    /// <summary>
    /// Cuts the line down to the quantity actually delivered and returns what was not delivered. Line VAT, the
    /// line discount and the line's share of the bill discount are split in proportion (rounded to 2 dp on the
    /// received part; the remainder goes to the shortfall), so received + shortfall always equals the original
    /// line. Free goods: <paramref name="receivedFreeQuantity"/> null means the free quantity in proportion to
    /// the paid quantity delivered, rounded down to whole units (all of it when the line arrived in full). More free
    /// goods than ordered may arrive (an extra bonus); the shortfall then carries no free goods.
    /// </summary>
    internal PurchaseOrderShortfall ReduceTo(decimal receivedQuantity, decimal? receivedFreeQuantity = null)
    {
        decimal freeReceived = receivedFreeQuantity
            ?? (Quantity == 0m || receivedQuantity == Quantity
                ? FreeQuantity
                : Math.Floor(FreeQuantity * receivedQuantity / Quantity));
        if (freeReceived < 0m)
        {
            throw PurchaseLineMath.BadRequest($"Received free quantity for medicine {MedicineId} cannot be negative.");
        }

        decimal shortQuantity = Quantity - receivedQuantity;
        decimal ratio = Quantity == 0m ? 0m : receivedQuantity / Quantity;
        decimal receivedVat = PurchaseLineMath.Round(VatAmount * ratio);
        decimal receivedDiscount = PurchaseLineMath.Round(DiscountAmount * ratio);
        decimal receivedBillDiscount = PurchaseLineMath.Round(BillDiscountAmount * ratio);
        var shortfall = new PurchaseOrderShortfall(
            MedicineId, shortQuantity, UnitCostPrice, SellingPrice, RackLocation, VatAmount - receivedVat,
            new PurchaseLineTerms(
                Math.Max(0m, FreeQuantity - freeReceived), DiscountPercent, DiscountAmount - receivedDiscount, PackSize, PackUnitCost),
            BillDiscountAmount - receivedBillDiscount);

        Quantity = receivedQuantity;
        FreeQuantity = freeReceived;
        VatAmount = receivedVat;
        DiscountAmount = receivedDiscount;
        BillDiscountAmount = receivedBillDiscount;
        return shortfall;
    }

    /// <summary>Records what came with the goods: each value given replaces the order-time one; a blank keeps it.</summary>
    internal void ApplyReceiptDetails(string? batchNo, DateOnly? expiryDate, decimal? sellingPrice)
    {
        BatchNo = Normalize(batchNo) ?? BatchNo;
        ExpiryDate = expiryDate ?? ExpiryDate;
        SellingPrice = sellingPrice ?? SellingPrice;
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

/// <summary>The part of an order line that was not delivered on a short receipt: its quantity, the undelivered
/// free goods and line discount (<see cref="Terms"/>) and the undelivered share of the bill discount.</summary>
public sealed record PurchaseOrderShortfall(
    Guid MedicineId,
    decimal Quantity,
    decimal UnitCostPrice,
    decimal? SellingPrice,
    string? RackLocation,
    decimal VatAmount,
    PurchaseLineTerms? Terms = null,
    decimal BillDiscountAmount = 0m);
