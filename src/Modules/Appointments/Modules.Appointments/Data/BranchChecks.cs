using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;

namespace FSH.Modules.Appointments.Data;

internal static class BranchChecks
{
    /// <summary>Refuses a sitting at a branch that isn't an active branch of this pharmacy.</summary>
    public static async Task EnsureActiveBranchesAsync(
        IBranchService branches, IEnumerable<Guid> branchIds, CancellationToken ct)
    {
        foreach (var branchId in branchIds.Distinct())
        {
            if (!await branches.IsActiveBranchOfCurrentTenantAsync(branchId, ct).ConfigureAwait(false))
            {
                throw new CustomException(
                    "Pick one of this pharmacy's open branches for each sitting.",
                    (IEnumerable<string>?)null,
                    HttpStatusCode.BadRequest);
            }
        }
    }
}
