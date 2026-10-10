using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Inventory.Domain;

/// <summary>
/// Per-location on-hand quantity for a medicine. <see cref="LocationId"/> is an opaque Guid — same
/// convention as <see cref="Medicine.CategoryId"/>: it points at a concept (a pharmacy branch/warehouse)
/// that has no module of its own yet in this .NET port, so there is no DB FK (architecture.md).
///
/// No longer used by stock transfers: transfers now move <see cref="MedicineBatch"/> rows between branches
/// (each branch is one location), with <see cref="StockTransferBatch"/> recording the lots moved. The table
/// is kept for now and nothing writes to it; it can be dropped in a follow-up migration.
/// </summary>
public sealed class MedicineLocationStock : AggregateRoot<Guid>
{
    public Guid MedicineId { get; private set; }
    public Guid LocationId { get; private set; }
    public decimal QuantityOnHand { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? UpdatedAtUtc { get; private set; }

    private MedicineLocationStock() { }

    public static MedicineLocationStock CreateEmpty(Guid medicineId, Guid locationId) => new()
    {
        Id = Guid.CreateVersion7(),
        MedicineId = medicineId,
        LocationId = locationId,
        QuantityOnHand = 0m,
        CreatedAtUtc = DateTime.UtcNow,
    };

    public void Credit(decimal quantity)
    {
        if (quantity <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(quantity), quantity, "Quantity to credit must be positive.");
        }

        QuantityOnHand += quantity;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>Debits up to the requested amount; throws (409) if this location doesn't have enough —
    /// mirrors the source system's create_stock_transfer "Insufficient stock at source branch" check.</summary>
    public void Debit(decimal quantity)
    {
        if (quantity <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(quantity), quantity, "Quantity to debit must be positive.");
        }

        if (quantity > QuantityOnHand)
        {
            throw new CustomException(
                $"Insufficient stock at location {LocationId} for medicine {MedicineId} — has {QuantityOnHand}, requested {quantity}.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        QuantityOnHand -= quantity;
        UpdatedAtUtc = DateTime.UtcNow;
    }
}
