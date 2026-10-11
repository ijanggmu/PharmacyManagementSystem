namespace FSH.Modules.Multitenancy.Contracts.Dtos;

/// <summary>
/// Branch-switching bootstrap payload: every branch the caller's tenant has, plus which one is the
/// caller's current branch. .NET-side equivalent of the Next.js reference's
/// <c>GET /api/branch-context</c> (lib/server/services/tenant-branch.ts).
/// </summary>
public sealed class BranchContextDto
{
    public IReadOnlyList<BranchDto> Branches { get; init; } = [];
    public Guid? CurrentBranchId { get; set; }
}
