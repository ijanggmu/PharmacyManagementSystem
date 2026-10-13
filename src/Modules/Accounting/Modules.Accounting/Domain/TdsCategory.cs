using FSH.Framework.Core.Domain;

namespace FSH.Modules.Accounting.Domain;

/// <summary>
/// A tenant's TDS (withholding tax) category: a stable <see cref="Code"/> (rent, service_vat, …), a display name
/// and the rate the web app pre-fills on an expense or supplier payment. One row per code per tenant; defaults come
/// from <see cref="TdsCategoryDefaults"/>. A category is never deleted (deductions keep a snapshot of its code,
/// name and rate) — it is deactivated instead.
/// </summary>
public sealed class TdsCategory : AggregateRoot<Guid>
{
    public const int CodeMaxLength = 32;
    public const int NameMaxLength = 128;

    public string Code { get; private set; } = default!;
    public string Name { get; private set; } = default!;

    /// <summary>Percent of the taxable amount (excluding VAT), e.g. 1.5 for 1.5%.</summary>
    public decimal RatePercent { get; private set; }
    public bool IsActive { get; private set; } = true;
    public int SortOrder { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }
    public string UpdatedBy { get; private set; } = default!;

    private TdsCategory() { }

    public static TdsCategory Create(string code, string name, decimal ratePercent, int sortOrder, string updatedBy)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(code);
        var category = new TdsCategory
        {
            Id = Guid.CreateVersion7(),
            Code = NormalizeCode(code),
            SortOrder = sortOrder,
        };
        category.Update(name, ratePercent, isActive: true, updatedBy);
        return category;
    }

    public void Update(string name, decimal ratePercent, bool isActive, string updatedBy)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        ArgumentException.ThrowIfNullOrWhiteSpace(updatedBy);
        EnsureRate(ratePercent);
        Name = name.Trim();
        RatePercent = ratePercent;
        IsActive = isActive;
        UpdatedBy = updatedBy.Trim();
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>Codes are compared lower-case and trimmed.</summary>
    public static string NormalizeCode(string code)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(code);
#pragma warning disable CA1308 // codes are lower-case ASCII identifiers (rent, service_vat), shared with the web app
        return code.Trim().ToLowerInvariant();
#pragma warning restore CA1308
    }

    public static void EnsureRate(decimal ratePercent)
    {
        if (ratePercent is <= 0m or > 100m)
        {
            throw new ArgumentOutOfRangeException(nameof(ratePercent), "A TDS rate must be more than 0% and at most 100%.");
        }
    }
}
