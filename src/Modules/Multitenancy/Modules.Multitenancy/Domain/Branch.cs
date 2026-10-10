using FSH.Framework.Core.Domain;

namespace FSH.Modules.Multitenancy.Domain;

/// <summary>
/// A tenant's physical/logical branch (store location). .NET port of the Next.js reference's
/// <c>branches</c> table (scripts/36-branches-and-branch-id.sql) — branch-scoped inventory, sales
/// and purchases, and each user's "current branch" selection, key off this entity's Id.
///
/// Lives in <see cref="Data.TenantDbContext"/> (the catalog database), same home as
/// <see cref="TenantTheme"/> — tenant isolation here is a manual <see cref="TenantId"/> filter in
/// every query (this DbContext is not a <c>BaseDbContext</c>, so there is no automatic tenant
/// query filter), not the automatic Finbuckle filter other modules' per-tenant DbContexts get.
/// </summary>
public class Branch : BaseEntity<Guid>, IHasTenant, IAuditableEntity
{
    public string TenantId { get; private set; } = default!;

    public string Name { get; set; } = default!;

    /// <summary>Short, tenant-unique identifier (e.g. "MAIN", "DOWNTOWN").</summary>
    public string Code { get; set; } = default!;

    public bool IsActive { get; set; } = true;

    /// <summary>
    /// True for the tenant's designated default branch. Exactly one row per tenant should carry this
    /// (enforced in <see cref="Services.BranchService"/>, not a DB constraint, to keep the first-branch
    /// bootstrap simple). Existing data with no flagged row falls back to oldest-by-<see cref="CreatedOnUtc"/>
    /// in <see cref="Services.BranchService.GetDefaultBranchIdAsync"/>.
    /// </summary>
    public bool IsDefault { get; private set; }

    /// <summary>Optional street address (max 300).</summary>
    public string? Address { get; private set; }

    /// <summary>Optional contact phone (max 32).</summary>
    public string? Phone { get; private set; }

    /// <summary>Optional contact email (max 256).</summary>
    public string? Email { get; private set; }

    // IAuditableEntity
    public DateTimeOffset CreatedOnUtc { get; private set; } = DateTimeOffset.UtcNow;
    public string? CreatedBy { get; private set; }
    public DateTimeOffset? LastModifiedOnUtc { get; private set; }
    public string? LastModifiedBy { get; private set; }

    private Branch() { } // EF Core

    public static Branch Create(
        string tenantId, string name, string code, string? createdBy = null,
        string? address = null, string? phone = null, string? email = null, bool isDefault = false)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(tenantId);
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        ArgumentException.ThrowIfNullOrWhiteSpace(code);

        return new Branch
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Name = name.Trim(),
            Code = code.Trim(),
            IsActive = true,
            IsDefault = isDefault,
            Address = NormalizeOptional(address),
            Phone = NormalizeOptional(phone),
            Email = NormalizeOptional(email),
            CreatedBy = createdBy,
            CreatedOnUtc = DateTimeOffset.UtcNow
        };
    }

    /// <summary>Flags this branch as the tenant default. Callers must ensure no other branch is flagged.</summary>
    public void MarkAsDefault()
    {
        IsDefault = true;
        LastModifiedOnUtc = DateTimeOffset.UtcNow;
    }

    public void Update(
        string name, string code, bool isActive, string? modifiedBy,
        string? address = null, string? phone = null, string? email = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        ArgumentException.ThrowIfNullOrWhiteSpace(code);

        Name = name.Trim();
        Code = code.Trim();
        IsActive = isActive;
        Address = NormalizeOptional(address);
        Phone = NormalizeOptional(phone);
        Email = NormalizeOptional(email);
        LastModifiedOnUtc = DateTimeOffset.UtcNow;
        LastModifiedBy = modifiedBy;
    }

    /// <summary>Soft-deactivates the branch. Rows are kept so historical stock and sales still resolve.</summary>
    public void Deactivate(string? modifiedBy)
    {
        IsActive = false;
        LastModifiedOnUtc = DateTimeOffset.UtcNow;
        LastModifiedBy = modifiedBy;
    }

    private static string? NormalizeOptional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
