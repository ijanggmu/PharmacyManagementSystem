using FSH.Framework.Shared.Persistence;
using FSH.Modules.Multitenancy.Contracts.Dtos;
using FSH.Modules.Multitenancy.Contracts.v1.GetBranches;

namespace FSH.Modules.Multitenancy.Contracts;

public interface IBranchService
{
    Task<BranchDto> CreateAsync(string name, string code, CancellationToken cancellationToken = default);

    Task<BranchDto> CreateAsync(
        string name, string code, string? address, string? phone, string? email,
        CancellationToken cancellationToken = default);

    Task<BranchDto> UpdateAsync(Guid id, string name, string code, bool isActive, CancellationToken cancellationToken = default);

    Task<BranchDto> UpdateAsync(
        Guid id, string name, string code, bool isActive, string? address, string? phone, string? email,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Soft-deactivates a branch. Throws a 409 for the tenant default branch (<see cref="GetDefaultBranchIdAsync"/>)
    /// and when it is the last active branch. Deactivating an already inactive branch returns it unchanged.
    /// </summary>
    Task<BranchDto> DeactivateAsync(Guid id, CancellationToken cancellationToken = default);

    Task<BranchDto> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);

    Task<PagedResponse<BranchDto>> GetAllAsync(GetBranchesQuery query, CancellationToken cancellationToken = default);

    Task<bool> ExistsWithCodeAsync(string code, Guid? exceptId = null, CancellationToken cancellationToken = default);

    /// <summary>Lists every branch (active and inactive) belonging to the current tenant, unpaged.</summary>
    Task<IReadOnlyList<BranchDto>> GetAllForCurrentTenantAsync(CancellationToken cancellationToken = default);

    /// <summary>True when <paramref name="id"/> is an active branch belonging to the current tenant.</summary>
    Task<bool> IsActiveBranchOfCurrentTenantAsync(Guid id, CancellationToken cancellationToken = default);

    /// <summary>
    /// The current tenant's default branch — its oldest branch (first created) — or <c>null</c>
    /// when the tenant has no branches at all. Used by <see cref="ICurrentBranch"/> as the final
    /// fallback when the caller has no branch selection of their own, mirroring the Next.js app's
    /// "oldest branch for this tenant" backfill semantics (scripts 36/42/79).
    /// </summary>
    Task<Guid?> GetDefaultBranchIdAsync(CancellationToken cancellationToken = default);
}
