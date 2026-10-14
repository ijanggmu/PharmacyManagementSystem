namespace FSH.Modules.Multitenancy.Contracts.Dtos;

public sealed class TenantStatusDto
{
    public string Id { get; init; } = default!;
    public string Name { get; init; } = default!;
    public bool IsActive { get; init; }
    public DateTime ValidUpto { get; init; }
    public bool HasConnectionString { get; init; }
    /// <summary>The tenant owner's email; null for callers who don't administer users or tenants.</summary>
    public string? AdminEmail { get; init; }
    public string? Issuer { get; init; }

    /// <summary>The tenant's current billing plan key (drives quotas + subscription).</summary>
    public string? Plan { get; init; }

    /// <summary>Derived lifecycle state: "Active", "InGrace", or "Expired".</summary>
    public string ExpiryState { get; init; } = "Active";

    /// <summary>Instant after which a lapsed tenant is hard-blocked (ValidUpto + grace period).</summary>
    public DateTime GraceEndsUtc { get; init; }

    /// <summary>The same status with the owner's email left out.</summary>
    public TenantStatusDto WithoutAdminEmail() => new()
    {
        Id = Id,
        Name = Name,
        IsActive = IsActive,
        ValidUpto = ValidUpto,
        HasConnectionString = HasConnectionString,
        AdminEmail = null,
        Issuer = Issuer,
        Plan = Plan,
        ExpiryState = ExpiryState,
        GraceEndsUtc = GraceEndsUtc,
    };
}