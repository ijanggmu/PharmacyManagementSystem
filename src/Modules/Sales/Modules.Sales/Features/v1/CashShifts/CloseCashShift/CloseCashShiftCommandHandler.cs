using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.v1.CashShifts;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.CashShifts.CloseCashShift;

public sealed class CloseCashShiftCommandHandler(
    SalesDbContext dbContext,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    IMediator mediator) : ICommandHandler<CloseCashShiftCommand, Guid>
{
    public async ValueTask<Guid> Handle(CloseCashShiftCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var shift = await dbContext.CashShifts
            .FirstOrDefaultAsync(s => s.Id == command.CashShiftId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Cash shift {command.CashShiftId} not found.");
        await currentBranch.EnsureCanSeeBranchAsync(shift.BranchId, $"Cash shift {command.CashShiftId} not found.", cancellationToken).ConfigureAwait(false);

        // Freeze the drawer reconciliation at close: a later cancellation/return of a sale from this window
        // must not change what this (already counted) shift was expected to hold.
        var totals = await CashDrawerCalculator
            .ComputeAsync(dbContext, mediator, shift.BranchId, shift.OpenedAtUtc, DateTime.UtcNow, cancellationToken)
            .ConfigureAwait(false);

        shift.Close(currentUser.Name ?? currentUser.GetUserId().ToString(), command.ClosingCashCounted, command.ClosingNotes, totals);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        return shift.Id;
    }
}
