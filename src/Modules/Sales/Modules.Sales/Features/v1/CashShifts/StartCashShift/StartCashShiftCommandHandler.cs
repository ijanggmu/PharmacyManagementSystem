using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.v1.CashShifts;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Data.Configurations;
using Mediator;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace FSH.Modules.Sales.Features.v1.CashShifts.StartCashShift;

public sealed class StartCashShiftCommandHandler(
    SalesDbContext dbContext,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch) : ICommandHandler<StartCashShiftCommand, Guid>
{
    public async ValueTask<Guid> Handle(StartCashShiftCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var branchId = await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);

        // One drawer per branch: another branch's open shift doesn't block this one.
        bool alreadyOpen = await dbContext.CashShifts
            .AnyAsync(s => s.Status == CashShiftStatus.Open && s.BranchId == branchId, cancellationToken)
            .ConfigureAwait(false);
        if (alreadyOpen)
        {
            throw new CustomException(
                "A cash shift is already open at this branch. Close it before starting a new one.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        var shift = CashShift.Open(
            branchId, currentUser.Name ?? currentUser.GetUserId().ToString(), command.OpeningFloat, command.Notes);

        dbContext.CashShifts.Add(shift);
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (DbUpdateException ex) when (IsOpenShiftConflict(ex))
        {
            // Lost the race to a concurrent "start shift" at the same branch (unique partial index).
            dbContext.Entry(shift).State = EntityState.Detached;
            throw new CustomException(
                "A cash shift is already open at this branch. Close it before starting a new one.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        return shift.Id;
    }

    private static bool IsOpenShiftConflict(Exception exception)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
        {
            if (current is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } pg
                && string.Equals(pg.ConstraintName, CashShiftConfiguration.OneOpenShiftPerBranchIndexName, StringComparison.Ordinal))
            {
                return true;
            }
        }

        return false;
    }
}
