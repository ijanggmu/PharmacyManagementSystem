using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Multitenancy.Contracts;

/// <summary>Read-side branch confinement helpers for single-record (GetById) handlers.</summary>
public static class CurrentBranchExtensions
{
    /// <summary>
    /// Whether the caller may see a record stamped with <paramref name="recordBranchId"/>: callers holding
    /// <c>Branches.ViewAll</c> see every branch; everyone else only their own branch. A record without a
    /// branch (legacy, tenant-wide) stays visible, matching the list queries.
    /// </summary>
    public static async Task<bool> CanSeeBranchAsync(
        this ICurrentBranch currentBranch, Guid? recordBranchId, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(currentBranch);

        if (recordBranchId is null || await currentBranch.CanViewAllBranchesAsync(cancellationToken).ConfigureAwait(false))
        {
            return true;
        }

        Guid? ownBranch = await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);
        return ownBranch is null || ownBranch == recordBranchId;
    }

    /// <summary>
    /// Throws <see cref="NotFoundException"/> (not 403, so other branches' record ids don't leak) when the
    /// caller may not see a record of <paramref name="recordBranchId"/>.
    /// </summary>
    public static async Task EnsureCanSeeBranchAsync(
        this ICurrentBranch currentBranch, Guid? recordBranchId, string notFoundMessage, CancellationToken cancellationToken = default)
    {
        if (!await currentBranch.CanSeeBranchAsync(recordBranchId, cancellationToken).ConfigureAwait(false))
        {
            throw new NotFoundException(notFoundMessage);
        }
    }
}
