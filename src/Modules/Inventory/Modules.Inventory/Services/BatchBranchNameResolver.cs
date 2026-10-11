using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts.v1.GetBranchById;
using Mediator;

namespace FSH.Modules.Inventory.Services;

/// <summary>
/// Resolves branch display names for batch DTOs through the Multitenancy contract query (never its runtime
/// project). A branch the lookup cannot find is left out of the map, so the DTO keeps a null name.
/// </summary>
internal static class BatchBranchNameResolver
{
    public static async Task<IReadOnlyDictionary<Guid, string>> ResolveAsync(
        IMediator mediator, IEnumerable<Guid> branchIds, CancellationToken cancellationToken = default)
    {
        var names = new Dictionary<Guid, string>();
        foreach (var branchId in branchIds.Distinct())
        {
            try
            {
                var branch = await mediator.Send(new GetBranchByIdQuery(branchId), cancellationToken).ConfigureAwait(false);
                if (branch?.Name is { Length: > 0 } name)
                {
                    names[branchId] = name;
                }
            }
            catch (NotFoundException)
            {
                // Branch no longer exists; the DTO keeps a null name.
            }
        }

        return names;
    }
}
