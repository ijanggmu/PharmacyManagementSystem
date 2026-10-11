using FSH.Framework.Core.Domain;

namespace FSH.Modules.Reference.Domain;

/// <summary>
/// Generic tenant-scoped key/value setting. One row per (tenant, key). The tenant discriminator
/// is applied by BaseDbContext, and the unique index is widened to include it.
/// </summary>
public sealed class TenantSetting : AggregateRoot<Guid>
{
    public string Key { get; private set; } = default!;
    public string Value { get; private set; } = default!;
    public DateTime UpdatedAtUtc { get; private set; }

    private TenantSetting() { }

    public static TenantSetting Create(string key, string value)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(key);
        ArgumentNullException.ThrowIfNull(value);

        return new TenantSetting
        {
            Id = Guid.CreateVersion7(),
            Key = key.Trim(),
            Value = value,
            UpdatedAtUtc = DateTime.UtcNow,
        };
    }

    public void UpdateValue(string value)
    {
        ArgumentNullException.ThrowIfNull(value);

        Value = value;
        UpdatedAtUtc = DateTime.UtcNow;
    }
}
