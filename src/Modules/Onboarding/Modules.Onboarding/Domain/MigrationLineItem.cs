using FSH.Framework.Core.Domain;

namespace FSH.Modules.Onboarding.Domain;

/// <summary>
/// One draft opening-balance line saved under a <see cref="MigrationSession"/>, before it is turned
/// into GL vouchers / stock batches / ledger entries by <c>CommitMigrationSessionCommandHandler</c>.
/// Not an aggregate root — always addressed through its owning session's id, mirrors how the Next.js
/// wizard has no standalone "line" concept until commit time, only lets the caller build up the set of
/// items to import per category.
/// </summary>
public sealed class MigrationLineItem : BaseEntity<Guid>
{
    public Guid SessionId { get; private set; }
    public MigrationCategory Category { get; private set; }

    /// <summary>Customer/Supplier id — only set for those two categories.</summary>
    public Guid? PartyId { get; private set; }

    /// <summary>Medicine id — only set for the Stock category.</summary>
    public Guid? MedicineId { get; private set; }

    /// <summary>Cash/Bank/Customer/Supplier opening amount.</summary>
    public decimal? Amount { get; private set; }

    /// <summary>Stock opening quantity.</summary>
    public decimal? Quantity { get; private set; }

    /// <summary>Stock opening unit cost.</summary>
    public decimal? UnitCost { get; private set; }

    /// <summary>Stock selling price — defaults to <see cref="UnitCost"/> when not supplied.</summary>
    public decimal? SellingPrice { get; private set; }

    public string? BatchNo { get; private set; }
    public DateOnly? ExpiryDate { get; private set; }
    public string? Description { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    private MigrationLineItem() { }

    public static MigrationLineItem CreateCashOrBank(Guid sessionId, MigrationCategory category, decimal amount, string? description)
    {
        if (category is not (MigrationCategory.Cash or MigrationCategory.Bank))
        {
            throw new ArgumentOutOfRangeException(nameof(category), category, "Must be Cash or Bank.");
        }

        if (amount <= 0)
        {
            throw new ArgumentException("Amount must be positive.", nameof(amount));
        }

        return new MigrationLineItem
        {
            Id = Guid.CreateVersion7(),
            SessionId = sessionId,
            Category = category,
            Amount = amount,
            Description = description?.Trim(),
            CreatedAtUtc = DateTime.UtcNow,
        };
    }

    public static MigrationLineItem CreateParty(Guid sessionId, MigrationCategory category, Guid partyId, decimal amount, string? description)
    {
        if (category is not (MigrationCategory.Customer or MigrationCategory.Supplier))
        {
            throw new ArgumentOutOfRangeException(nameof(category), category, "Must be Customer or Supplier.");
        }

        if (partyId == Guid.Empty)
        {
            throw new ArgumentException("Party id is required.", nameof(partyId));
        }

        if (amount <= 0)
        {
            throw new ArgumentException("Amount must be positive.", nameof(amount));
        }

        return new MigrationLineItem
        {
            Id = Guid.CreateVersion7(),
            SessionId = sessionId,
            Category = category,
            PartyId = partyId,
            Amount = amount,
            Description = description?.Trim(),
            CreatedAtUtc = DateTime.UtcNow,
        };
    }

    public static MigrationLineItem CreateStock(
        Guid sessionId,
        Guid medicineId,
        decimal quantity,
        decimal unitCost,
        decimal? sellingPrice,
        string batchNo,
        DateOnly expiryDate,
        string? description)
    {
        if (medicineId == Guid.Empty)
        {
            throw new ArgumentException("Medicine id is required.", nameof(medicineId));
        }

        if (quantity <= 0)
        {
            throw new ArgumentException("Quantity must be positive.", nameof(quantity));
        }

        if (unitCost < 0)
        {
            throw new ArgumentException("Unit cost cannot be negative.", nameof(unitCost));
        }

        ArgumentException.ThrowIfNullOrWhiteSpace(batchNo);

        return new MigrationLineItem
        {
            Id = Guid.CreateVersion7(),
            SessionId = sessionId,
            Category = MigrationCategory.Stock,
            MedicineId = medicineId,
            Quantity = quantity,
            UnitCost = unitCost,
            SellingPrice = sellingPrice ?? unitCost,
            BatchNo = batchNo.Trim(),
            ExpiryDate = expiryDate,
            Description = description?.Trim(),
            CreatedAtUtc = DateTime.UtcNow,
        };
    }
}
