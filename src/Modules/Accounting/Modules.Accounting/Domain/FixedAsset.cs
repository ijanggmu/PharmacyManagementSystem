using FSH.Framework.Core.Domain;

namespace FSH.Modules.Accounting.Domain;

public enum FixedAssetAcquisitionSource
{
    CashBank = 0,
    Supplier = 1,
    Opening = 2,
}

public enum FixedAssetDisposalKind
{
    Sale = 0,
    WriteOff = 1,
}

/// <summary>
/// One entry of the fixed asset register: what was bought, for how much, how it is depreciated in the books
/// (<see cref="Method"/>) and for tax (<see cref="TaxPool"/>), and — once it has left — how. The GL side lives in
/// vouchers: the acquisition (reference <c>FixedAsset</c> / id), depreciation runs (<see cref="FixedAssetDepreciationEntry"/>
/// rows say which months are posted) and the disposal (reference <c>FixedAssetDisposal</c> / id).
/// <para><see cref="Cost"/> is the capitalised cost excluding claimable input VAT. An opening asset (owned before
/// go-live) carries its depreciation to date in <see cref="OpeningAccumulatedDepreciation"/> and starts depreciating in
/// <see cref="StartPeriod"/>.</para>
/// </summary>
public sealed class FixedAsset : AggregateRoot<Guid>
{
    public const int NameMaxLength = 200;
    public const int CategoryMaxLength = 100;
    public const int TagMaxLength = 64;
    public const int LocationMaxLength = 200;
    public const int NotesMaxLength = 1024;

    public string Name { get; private set; } = default!;
    public string Category { get; private set; } = default!;
    public string? AssetTag { get; private set; }
    public string? Location { get; private set; }
    public Guid? BranchId { get; private set; }

    public DateTime AcquisitionDateUtc { get; private set; }
    public FixedAssetAcquisitionSource Source { get; private set; }
    public string? PaymentMethod { get; private set; }
    public Guid? SupplierId { get; private set; }
    public string? VendorName { get; private set; }
    public string? SupplierVatNumber { get; private set; }
    public string? BillNumber { get; private set; }

    /// <summary>Capitalised cost, excluding the input VAT claimed.</summary>
    public decimal Cost { get; private set; }

    /// <summary>Input VAT on the purchase bill (debited to Input VAT Recoverable, not part of the cost).</summary>
    public decimal VatAmount { get; private set; }
    public decimal ResidualValue { get; private set; }
    public FixedAssetDepreciationMethod Method { get; private set; }
    public int? UsefulLifeMonths { get; private set; }
    public decimal? RatePercent { get; private set; }
    public string TaxPool { get; private set; } = default!;
    public int? TaxUsefulLifeYears { get; private set; }

    public decimal OpeningAccumulatedDepreciation { get; private set; }
    public decimal? OpeningTaxWrittenDownValue { get; private set; }

    /// <summary><see cref="FiscalPeriod.Index"/> of the acquisition month.</summary>
    public int AcquisitionPeriod { get; private set; }

    /// <summary><see cref="FiscalPeriod.Index"/> of the first month depreciated (the go-live month for an opening asset).</summary>
    public int StartPeriod { get; private set; }

    public bool IsDisposed { get; private set; }
    public DateTime? DisposedOnUtc { get; private set; }
    public FixedAssetDisposalKind? DisposalKind { get; private set; }
    public decimal? DisposalProceeds { get; private set; }
    public string? DisposalPaymentMethod { get; private set; }

    /// <summary>Accumulated depreciation removed on disposal (opening + every posted month).</summary>
    public decimal? DisposalAccumulatedDepreciation { get; private set; }

    /// <summary>Proceeds − net book value at disposal: positive = gain, negative = loss.</summary>
    public decimal? DisposalGainLoss { get; private set; }
    public string? DisposalNotes { get; private set; }

    public string? Notes { get; private set; }
    public string CreatedBy { get; private set; } = default!;
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? UpdatedAtUtc { get; private set; }

    private FixedAsset() { }

    public bool IsOpening => Source == FixedAssetAcquisitionSource.Opening;

    /// <summary>Disposal month: nothing is depreciated for it or later.</summary>
    public int? DisposalPeriod => DisposedOnUtc is { } at ? FiscalPeriod.OfUtc(at).Index : null;

    public BookDepreciationTerms Terms => new(
        Cost, ResidualValue, Method, UsefulLifeMonths, RatePercent, AcquisitionPeriod, StartPeriod,
        OpeningAccumulatedDepreciation, DisposalPeriod);

#pragma warning disable S107 // A register entry has this many facts; a parameter object would only rename them.
    public static FixedAsset Create(
        string name, string category, DateTime acquisitionDateUtc, FixedAssetAcquisitionSource source, decimal cost,
        decimal vatAmount, string createdBy, Guid? branchId, string? paymentMethod = null, Guid? supplierId = null,
        string? vendorName = null, string? supplierVatNumber = null, string? billNumber = null,
        decimal openingAccumulatedDepreciation = 0m, DateTime? depreciationStartDateUtc = null,
        decimal? openingTaxWrittenDownValue = null)
#pragma warning restore S107
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(createdBy);
        if (cost <= 0m)
        {
            throw new ArgumentOutOfRangeException(nameof(cost), "An asset's cost must be positive.");
        }

        bool opening = source == FixedAssetAcquisitionSource.Opening;
        int acquisitionPeriod = FiscalPeriod.OfUtc(acquisitionDateUtc).Index;
        int startPeriod = opening && depreciationStartDateUtc is { } start
            ? Math.Max(acquisitionPeriod, FiscalPeriod.OfUtc(start).Index)
            : acquisitionPeriod;

        var asset = new FixedAsset
        {
            Id = Guid.CreateVersion7(),
            AcquisitionDateUtc = acquisitionDateUtc,
            Source = source,
            Cost = cost,
            VatAmount = opening ? 0m : Math.Max(0m, vatAmount),
            PaymentMethod = source == FixedAssetAcquisitionSource.CashBank ? Trim(paymentMethod, 32) : null,
            SupplierId = source == FixedAssetAcquisitionSource.Supplier ? supplierId : null,
            VendorName = Trim(vendorName, 256),
            SupplierVatNumber = Trim(supplierVatNumber, 32),
            BillNumber = Trim(billNumber, 128),
            BranchId = branchId,
            OpeningAccumulatedDepreciation = opening ? Math.Max(0m, openingAccumulatedDepreciation) : 0m,
            OpeningTaxWrittenDownValue = opening ? openingTaxWrittenDownValue : null,
            AcquisitionPeriod = acquisitionPeriod,
            StartPeriod = startPeriod,
            CreatedBy = createdBy,
            CreatedAtUtc = DateTime.UtcNow,
            Name = default!,
            Category = default!,
            TaxPool = default!,
        };
        asset.Describe(name, category, null, null, null);
        return asset;
    }

    /// <summary>The date the acquisition voucher carries: the go-live date for an opening asset, else the acquisition.</summary>
    public static DateTime AcquisitionVoucherDate(FixedAssetAcquisitionSource source, DateTime acquisitionDateUtc, DateTime? depreciationStartDateUtc) =>
        source == FixedAssetAcquisitionSource.Opening && depreciationStartDateUtc is { } start && start > acquisitionDateUtc
            ? start
            : acquisitionDateUtc;

    public void Describe(string name, string category, string? assetTag, string? location, string? notes)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        ArgumentException.ThrowIfNullOrWhiteSpace(category);
        Name = Trim(name, NameMaxLength)!;
        Category = Trim(category, CategoryMaxLength)!;
        AssetTag = Trim(assetTag, TagMaxLength);
        Location = Trim(location, LocationMaxLength);
        Notes = Trim(notes, NotesMaxLength);
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>Sets how the asset is depreciated. Straight line needs a useful life, written-down value a rate; the
    /// residual value must be below the cost. Callers refuse this once depreciation has been posted.</summary>
    public void SetDepreciationTerms(
        decimal residualValue, FixedAssetDepreciationMethod method, int? usefulLifeMonths, decimal? ratePercent,
        string taxPool, int? taxUsefulLifeYears)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(taxPool);
        if (residualValue < 0m || residualValue >= Cost)
        {
            throw new ArgumentOutOfRangeException(nameof(residualValue), "The residual value must be at least 0 and below the cost.");
        }

        ResidualValue = residualValue;
        Method = method;
        UsefulLifeMonths = method == FixedAssetDepreciationMethod.StraightLine ? usefulLifeMonths : null;
        RatePercent = method == FixedAssetDepreciationMethod.WrittenDownValue ? ratePercent : null;
        TaxPool = taxPool.Trim().ToUpperInvariant();
        TaxUsefulLifeYears = taxUsefulLifeYears;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void RecordDisposal(
        DateTime disposedOnUtc, FixedAssetDisposalKind kind, decimal proceeds, string? paymentMethod,
        decimal accumulatedDepreciation, string? notes)
    {
        if (IsDisposed)
        {
            throw new InvalidOperationException("The asset has already been disposed.");
        }

        IsDisposed = true;
        DisposedOnUtc = disposedOnUtc;
        DisposalKind = kind;
        DisposalProceeds = kind == FixedAssetDisposalKind.WriteOff ? 0m : proceeds;
        DisposalPaymentMethod = kind == FixedAssetDisposalKind.WriteOff ? null : Trim(paymentMethod, 32);
        DisposalAccumulatedDepreciation = accumulatedDepreciation;
        DisposalGainLoss = DisposalProceeds.Value - (Cost - accumulatedDepreciation);
        DisposalNotes = Trim(notes, NotesMaxLength);
        UpdatedAtUtc = DateTime.UtcNow;
    }

    private static string? Trim(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        string trimmed = value.Trim();
        return trimmed.Length <= max ? trimmed : trimmed[..max];
    }
}
