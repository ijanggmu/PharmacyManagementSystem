using FSH.Framework.Core.Domain;

namespace FSH.Modules.Reference.Domain;

public sealed class MedicineCategory : AggregateRoot<Guid>, ISoftDeletable
{
    public string Name { get; private set; } = default!;
    public string Slug { get; private set; } = default!;
    public string? Description { get; private set; }
    public Guid? ParentCategoryId { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? UpdatedAtUtc { get; private set; }

    public bool IsDeleted { get; private set; }
    public DateTimeOffset? DeletedOnUtc { get; private set; }
    public string? DeletedBy { get; private set; }

    public void Restore()
    {
        if (!IsDeleted) return;
        IsDeleted = false;
        DeletedOnUtc = null;
        DeletedBy = null;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    private MedicineCategory() { }

    public static MedicineCategory Create(string name, string? description, Guid? parentCategoryId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);

        return new MedicineCategory
        {
            Id = Guid.CreateVersion7(),
            Name = name.Trim(),
            Slug = Slugify(name),
            Description = description?.Trim(),
            ParentCategoryId = parentCategoryId,
            CreatedAtUtc = DateTime.UtcNow
        };
    }

    public void Update(string name, string? description, Guid? parentCategoryId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        if (parentCategoryId == Id)
        {
            throw new InvalidOperationException("A category cannot be its own parent.");
        }

        Name = name.Trim();
        Slug = Slugify(name);
        Description = description?.Trim();
        ParentCategoryId = parentCategoryId;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    private static string Slugify(string value)
    {
        var trimmed = value.Trim();
#pragma warning disable CA1308 // slug is canonical lowercase, not security-sensitive
        var lower = trimmed.ToLowerInvariant();
#pragma warning restore CA1308
        var chars = lower.Select(c => char.IsLetterOrDigit(c) ? c : '-').ToArray();
        var collapsed = new string(chars).Trim('-');
        while (collapsed.Contains("--", StringComparison.Ordinal))
        {
            collapsed = collapsed.Replace("--", "-", StringComparison.Ordinal);
        }
        return collapsed;
    }
}
