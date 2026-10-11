namespace FSH.Modules.Multitenancy.Contracts.Dtos;

public sealed class TenantDto
{
    public string Id { get; set; } = default!;
    public string Name { get; set; } = default!;
    public string? ConnectionString { get; set; }
    public string AdminEmail { get; set; } = default!;
    public bool IsActive { get; set; }
    public DateTime ValidUpto { get; set; }
    public string? Issuer { get; set; }

    /// <summary>The tenant's current billing plan key (drives quotas + subscription). Null falls back to the default plan.</summary>
    public string? Plan { get; set; }
}