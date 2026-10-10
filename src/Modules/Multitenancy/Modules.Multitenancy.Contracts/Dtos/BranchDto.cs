namespace FSH.Modules.Multitenancy.Contracts.Dtos;

public sealed class BranchDto
{
    public Guid Id { get; set; }
    public string TenantId { get; set; } = default!;
    public string Name { get; set; } = default!;
    public string Code { get; set; } = default!;
    public bool IsActive { get; set; }
    public bool IsDefault { get; set; }
    public DateTimeOffset CreatedOnUtc { get; set; }
    public DateTimeOffset? LastModifiedOnUtc { get; set; }
    public string? Address { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
}
