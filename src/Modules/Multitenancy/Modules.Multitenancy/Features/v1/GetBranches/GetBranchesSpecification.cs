using FSH.Framework.Persistence;
using FSH.Modules.Multitenancy.Contracts.Dtos;
using FSH.Modules.Multitenancy.Contracts.v1.GetBranches;
using FSH.Modules.Multitenancy.Domain;
using System.Linq.Expressions;

namespace FSH.Modules.Multitenancy.Features.v1.GetBranches;

internal sealed class GetBranchesSpecification : Specification<Branch, BranchDto>
{
    private static readonly IReadOnlyDictionary<string, Expression<Func<Branch, object>>> SortMappings =
        new Dictionary<string, Expression<Func<Branch, object>>>(StringComparer.OrdinalIgnoreCase)
        {
            ["name"] = b => b.Name,
            ["code"] = b => b.Code,
            ["isactive"] = b => b.IsActive,
            ["createdonutc"] = b => b.CreatedOnUtc
        };

    public GetBranchesSpecification(GetBranchesQuery query, string tenantId)
    {
        ArgumentNullException.ThrowIfNull(query);
        ArgumentException.ThrowIfNullOrWhiteSpace(tenantId);

        // TenantDbContext has no automatic tenant query filter (it's an EFCoreStoreDbContext, not a
        // BaseDbContext), so every query against it must filter by tenant explicitly — same reason
        // TenantThemeService always filters TenantThemes by TenantId by hand.
        Where(b => b.TenantId == tenantId);

        Select(b => new BranchDto
        {
            Id = b.Id,
            TenantId = b.TenantId,
            Name = b.Name,
            Code = b.Code,
            IsActive = b.IsActive,
            IsDefault = b.IsDefault,
            CreatedOnUtc = b.CreatedOnUtc,
            LastModifiedOnUtc = b.LastModifiedOnUtc,
            Address = b.Address,
            Phone = b.Phone,
            Email = b.Email
        });

        AsNoTrackingQuery();

        ApplySortingOverride(
            query.Sort,
            () =>
            {
                OrderBy(b => b.Name);
                ThenBy(b => b.Code);
            },
            SortMappings);
    }
}
