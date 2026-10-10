using FSH.Framework.Core.Domain;

namespace FSH.Modules.Inventory.Domain;

public sealed class Medicine : AggregateRoot<Guid>, ISoftDeletable
{
    public string Name { get; private set; } = default!;
    public string? GenericName { get; private set; }

    /// <summary>Points at Reference module's MedicineCategory.Id — a plain Guid, not a DB FK, since
    /// modules never share schema-level foreign keys across their tables (architecture.md).</summary>
    public Guid? CategoryId { get; private set; }

    public decimal ReorderLevel { get; private set; }

    /// <summary>Scheduled/narcotic medicine — Prescriptions' dispensing-safety policy blocks a sale
    /// of a controlled medicine without a linked, unexpired prescription (root plan §6.2).</summary>
    public bool IsControlled { get; private set; }

    /// <summary>Default selling price per unit (legacy medicines.unit_price). Distinct from the per-batch SellingPrice.</summary>
    public decimal UnitPrice { get; private set; }

    /// <summary>Default cost price per unit (legacy medicines.cost_price). Distinct from the per-batch CostPrice.</summary>
    public decimal CostPrice { get; private set; }

    /// <summary>Dosage form, e.g. Tablet, Syrup, Injection.</summary>
    public string? Form { get; private set; }

    /// <summary>Strength, e.g. 500mg, 5mg/5ml.</summary>
    public string? Strength { get; private set; }

    /// <summary>Preferred supplier. A plain Guid, not a DB FK (modules never share schema-level foreign keys).</summary>
    public Guid? SupplierId { get; private set; }

    public string? Barcode { get; private set; }

    public string? Description { get; private set; }

    /// <summary>Maximum stock level to hold, in the same unit as ReorderLevel. Null means no maximum is set.</summary>
    public decimal? MaximumStock { get; private set; }

    /// <summary>Compliance flag: the medicine may only be dispensed against a prescription (set for controlled drugs).</summary>
    public bool PrescriptionRequired { get; private set; }

    /// <summary>Brand name (legacy medicines.brand_name).</summary>
    public string? BrandName { get; private set; }

    /// <summary>Dosage instructions (legacy medicines.dosage).</summary>
    public string? Dosage { get; private set; }

    /// <summary>Known side effects (legacy medicines.side_effects).</summary>
    public string? SideEffects { get; private set; }

    /// <summary>Storage guidance (legacy medicines.storage_instructions).</summary>
    public string? StorageInstructions { get; private set; }

    /// <summary>Minimum storage temperature in °C (legacy medicines.storage_temp_min_c).</summary>
    public decimal? StorageTempMinC { get; private set; }

    /// <summary>Maximum storage temperature in °C (legacy medicines.storage_temp_max_c).</summary>
    public decimal? StorageTempMaxC { get; private set; }

    /// <summary>Must be kept within the cold chain (legacy medicines.requires_cold_chain).</summary>
    public bool RequiresColdChain { get; private set; }

    /// <summary>Units per pack when stock is bought in packs (legacy medicines.units_per_pack). Null when not set.</summary>
    public int? UnitsPerPack { get; private set; }

    /// <summary>Label for the unit of sale, e.g. Tablet, Strip (legacy medicines.unit_label).</summary>
    public string? UnitLabel { get; private set; }

    /// <summary>Whether sales of this medicine carry tax (legacy medicines.is_taxable, default true).</summary>
    public bool IsTaxable { get; private set; }

    /// <summary>Supplier tax invoice / bill number for the initial stock receipt (legacy medicines.supplier_invoice_number).</summary>
    public string? SupplierInvoiceNumber { get; private set; }

    /// <summary>Recoverable VAT on the initial stock receipt (legacy medicines.vat_amount). Null when not set.</summary>
    public decimal? VatAmount { get; private set; }

    /// <summary>Controlled-substance schedule used by the narcotic register filter, e.g. II, III. Free text
    /// (the legacy system had no fixed set); trimmed, blank stored as null, max 20 characters.</summary>
    public string? ControlledSchedule { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? UpdatedAtUtc { get; private set; }

    public bool IsDeleted { get; private set; }
    public DateTimeOffset? DeletedOnUtc { get; private set; }
    public string? DeletedBy { get; private set; }

    private Medicine() { }

    public static Medicine Create(
        string name,
        string? genericName,
        Guid? categoryId,
        decimal reorderLevel,
        bool isControlled = false,
        decimal unitPrice = 0m,
        decimal costPrice = 0m,
        string? form = null,
        string? strength = null,
        Guid? supplierId = null,
        string? barcode = null,
        string? description = null,
        decimal? maximumStock = null,
        bool prescriptionRequired = false,
        string? brandName = null,
        string? dosage = null,
        string? sideEffects = null,
        string? storageInstructions = null,
        decimal? storageTempMinC = null,
        decimal? storageTempMaxC = null,
        bool requiresColdChain = false,
        int? unitsPerPack = null,
        string? unitLabel = null,
        bool isTaxable = true,
        string? supplierInvoiceNumber = null,
        decimal? vatAmount = null,
        string? controlledSchedule = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        if (reorderLevel < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(reorderLevel), reorderLevel, "Reorder level cannot be negative.");
        }

        ValidatePrices(unitPrice, costPrice);
        ValidateMaximumStock(maximumStock);
        ValidatePackAndVat(unitsPerPack, vatAmount);

        return new Medicine
        {
            Id = Guid.CreateVersion7(),
            Name = name.Trim(),
            GenericName = genericName?.Trim(),
            CategoryId = categoryId,
            ReorderLevel = reorderLevel,
            IsControlled = isControlled,
            UnitPrice = unitPrice,
            CostPrice = costPrice,
            Form = form?.Trim(),
            Strength = strength?.Trim(),
            SupplierId = supplierId,
            Barcode = barcode?.Trim(),
            Description = description?.Trim(),
            MaximumStock = maximumStock,
            PrescriptionRequired = prescriptionRequired,
            BrandName = brandName?.Trim(),
            Dosage = dosage?.Trim(),
            SideEffects = sideEffects?.Trim(),
            StorageInstructions = storageInstructions?.Trim(),
            StorageTempMinC = storageTempMinC,
            StorageTempMaxC = storageTempMaxC,
            RequiresColdChain = requiresColdChain,
            UnitsPerPack = unitsPerPack,
            UnitLabel = unitLabel?.Trim(),
            IsTaxable = isTaxable,
            SupplierInvoiceNumber = supplierInvoiceNumber?.Trim(),
            VatAmount = vatAmount,
            ControlledSchedule = NormalizeSchedule(controlledSchedule),
            CreatedAtUtc = DateTime.UtcNow,
        };
    }

    public void Update(
        string name,
        string? genericName,
        Guid? categoryId,
        decimal reorderLevel,
        bool isControlled,
        decimal unitPrice = 0m,
        decimal costPrice = 0m,
        string? form = null,
        string? strength = null,
        Guid? supplierId = null,
        string? barcode = null,
        string? description = null,
        decimal? maximumStock = null,
        bool prescriptionRequired = false,
        bool clearMaximumStock = false,
        bool clearOptionalDetails = false,
        string? brandName = null,
        string? dosage = null,
        string? sideEffects = null,
        string? storageInstructions = null,
        decimal? storageTempMinC = null,
        decimal? storageTempMaxC = null,
        bool? requiresColdChain = null,
        int? unitsPerPack = null,
        string? unitLabel = null,
        bool? isTaxable = null,
        string? supplierInvoiceNumber = null,
        decimal? vatAmount = null,
        string? controlledSchedule = null,
        bool clearControlledSchedule = false)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        if (reorderLevel < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(reorderLevel), reorderLevel, "Reorder level cannot be negative.");
        }

        ValidatePrices(unitPrice, costPrice);
        var resolvedMaximumStock = clearMaximumStock ? null : maximumStock;
        ValidateMaximumStock(resolvedMaximumStock);
        var resolvedUnitsPerPack = clearOptionalDetails ? null : unitsPerPack;
        var resolvedVatAmount = clearOptionalDetails ? null : vatAmount;
        ValidatePackAndVat(resolvedUnitsPerPack, resolvedVatAmount);

        Name = name.Trim();
        GenericName = genericName?.Trim();
        CategoryId = categoryId;
        ReorderLevel = reorderLevel;
        IsControlled = isControlled;
        UnitPrice = unitPrice;
        CostPrice = costPrice;
        Form = form?.Trim();
        Strength = strength?.Trim();
        SupplierId = supplierId;
        Barcode = barcode?.Trim();
        Description = description?.Trim();
        MaximumStock = resolvedMaximumStock;
        PrescriptionRequired = prescriptionRequired;

        // clearOptionalDetails explicitly unsets the optional details below. Otherwise omitted (null) values
        // keep the stored value, so a null never resets a legacy field to its default.
        BrandName = clearOptionalDetails ? null : brandName?.Trim() ?? BrandName;
        Dosage = clearOptionalDetails ? null : dosage?.Trim() ?? Dosage;
        SideEffects = clearOptionalDetails ? null : sideEffects?.Trim() ?? SideEffects;
        StorageInstructions = clearOptionalDetails ? null : storageInstructions?.Trim() ?? StorageInstructions;
        StorageTempMinC = clearOptionalDetails ? null : storageTempMinC ?? StorageTempMinC;
        StorageTempMaxC = clearOptionalDetails ? null : storageTempMaxC ?? StorageTempMaxC;
        RequiresColdChain = requiresColdChain ?? RequiresColdChain;
        UnitsPerPack = clearOptionalDetails ? null : unitsPerPack ?? UnitsPerPack;
        UnitLabel = clearOptionalDetails ? null : unitLabel?.Trim() ?? UnitLabel;
        IsTaxable = isTaxable ?? IsTaxable;
        SupplierInvoiceNumber = clearOptionalDetails ? null : supplierInvoiceNumber?.Trim() ?? SupplierInvoiceNumber;
        VatAmount = clearOptionalDetails ? null : vatAmount ?? VatAmount;
        // Schedule has its own clear flag; null alone keeps the stored value.
        ControlledSchedule = clearControlledSchedule ? null : NormalizeSchedule(controlledSchedule) ?? ControlledSchedule;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void Restore()
    {
        if (!IsDeleted) return;
        IsDeleted = false;
        DeletedOnUtc = null;
        DeletedBy = null;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>Trims the schedule; blank or whitespace-only input becomes null. Length is validated by the command validators.</summary>
    private static string? NormalizeSchedule(string? schedule) =>
        string.IsNullOrWhiteSpace(schedule) ? null : schedule.Trim();

    private static void ValidateMaximumStock(decimal? maximumStock)
    {
        if (maximumStock is < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(maximumStock), maximumStock, "Maximum stock cannot be negative.");
        }
    }

    private static void ValidatePackAndVat(int? unitsPerPack, decimal? vatAmount)
    {
        if (unitsPerPack is < 1)
        {
            throw new ArgumentOutOfRangeException(nameof(unitsPerPack), unitsPerPack, "Units per pack must be at least 1.");
        }

        if (vatAmount is < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(vatAmount), vatAmount, "VAT amount cannot be negative.");
        }
    }

    private static void ValidatePrices(decimal unitPrice, decimal costPrice)
    {
        if (unitPrice < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(unitPrice), unitPrice, "Unit price cannot be negative.");
        }

        if (costPrice < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(costPrice), costPrice, "Cost price cannot be negative.");
        }
    }
}
