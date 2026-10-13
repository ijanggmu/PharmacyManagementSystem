using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Multitenancy.Contracts;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Cheques;

/// <summary>Shared by the cheque action handlers: load a cheque (tracked, with its history) the caller may see.</summary>
internal static class ChequeLoader
{
    public static async Task<Cheque> LoadForUpdateAsync(
        AccountingDbContext dbContext, ICurrentBranch currentBranch, Guid chequeId, CancellationToken cancellationToken)
    {
        string notFound = $"Cheque {chequeId} not found.";

        // Tracked: the handlers change it and save.
        var cheque = await dbContext.Cheques
            .Include(c => c.History)
            .FirstOrDefaultAsync(c => c.Id == chequeId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException(notFound);

        await currentBranch.EnsureCanSeeBranchAsync(cheque.BranchId, notFound, cancellationToken).ConfigureAwait(false);
        return cheque;
    }

    public static string Actor(ICurrentUser currentUser)
    {
        ArgumentNullException.ThrowIfNull(currentUser);
        return currentUser.Name ?? currentUser.GetUserId().ToString();
    }
}
