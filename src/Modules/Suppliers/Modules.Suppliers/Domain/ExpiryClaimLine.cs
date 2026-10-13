using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Suppliers.Domain;

/// <summary>One claimed lot. Reached only through <see cref="ExpiryClaim.Lines"/> (ValueGeneratedNever in config).</summary>
public sealed class ExpiryClaimLine : BaseEntity<Guid>
{
    public Guid ExpiryClaimId { get; private set; }
    public Guid MedicineId { get; private set; }
    public string MedicineName { get; private set; } = default!;
    public Guid BatchId { get; private set; }
    public string BatchNo { get; private set; } = default!;
    public DateOnly ExpiryDate { get; private set; }

    /// <summary>Units claimed.</summary>
    public decimal Quantity { get; private set; }

    /// <summary>The lot's cost per unit when claimed (the debit note itself is valued at the lot cost when it leaves).</summary>
    public decimal UnitCost { get; private set; }

    /// <summary>Units the supplier accepted (null until answered).</summary>
    public decimal? AcceptedQuantity { get; private set; }

    private ExpiryClaimLine() { }

    internal static ExpiryClaimLine Create(
        Guid claimId, Guid medicineId, string medicineName, Guid batchId, string batchNo, DateOnly expiryDate,
        decimal quantity, decimal unitCost)
    {
        if (quantity <= 0)
        {
            throw new CustomException("Quantity must be positive.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        if (unitCost < 0)
        {
            throw new CustomException("Unit cost cannot be negative.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        return new ExpiryClaimLine
        {
            Id = Guid.CreateVersion7(),
            ExpiryClaimId = claimId,
            MedicineId = medicineId,
            MedicineName = string.IsNullOrWhiteSpace(medicineName) ? "Unknown medicine" : medicineName.Trim(),
            BatchId = batchId,
            BatchNo = batchNo,
            ExpiryDate = expiryDate,
            Quantity = quantity,
            UnitCost = unitCost,
        };
    }

    internal void Accept(decimal acceptedQuantity)
    {
        if (acceptedQuantity < 0 || acceptedQuantity > Quantity)
        {
            throw new CustomException(
                $"Accepted quantity for batch {BatchNo} must be between 0 and the {Quantity} claimed.",
                (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        AcceptedQuantity = acceptedQuantity;
    }
}
