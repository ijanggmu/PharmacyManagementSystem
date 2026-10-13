using System.Diagnostics;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Events;
using FSH.Modules.Sales.Contracts.v1.CashShifts;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.CashShifts.CloseCashShift;

/// <summary>
/// Closes the shift with the counted cash and freezes the drawer reconciliation. When the count differs
/// from the expected cash, <see cref="CashShiftClosedWithVarianceIntegrationEvent"/> is written to the
/// Outbox in the same transaction, so Accounting books the short/over and GL Cash follows the drawer.
/// </summary>
public sealed class CloseCashShiftCommandHandler(
    SalesDbContext dbContext,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    IMediator mediator) : ICommandHandler<CloseCashShiftCommand, Guid>
{
    public async ValueTask<Guid> Handle(CloseCashShiftCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        return await SalesTransaction.ExecuteAsync(
            dbContext,
            ct => CloseAsync(command, ct),
            cancellationToken).ConfigureAwait(false);
    }

    private async ValueTask<Guid> CloseAsync(CloseCashShiftCommand command, CancellationToken cancellationToken)
    {
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

        // A short or over drawer must reach the GL (Dr/Cr Cash Short & Over against Cash); a balanced one has
        // nothing to book.
        if (shift.GetClosingVariance() is { } variance && variance != 0m)
        {
            string correlationId = Activity.Current?.Id ?? Guid.NewGuid().ToString();
            await outbox.AddAsync(new CashShiftClosedWithVarianceIntegrationEvent(
                Id: Guid.NewGuid(),
                OccurredOnUtc: DateTime.UtcNow,
                TenantId: currentUser.GetTenant(),
                CorrelationId: correlationId,
                Source: "Sales",
                CashShiftId: shift.Id,
                BranchId: shift.BranchId,
                OpenedAtUtc: shift.OpenedAtUtc,
                ClosedAtUtc: shift.ClosedAtUtc!.Value,
                ClosedBy: shift.ClosedBy!,
                ExpectedCash: shift.ClosingExpectedCash!.Value,
                CountedCash: shift.ClosingCashCounted!.Value,
                Variance: variance),
                cancellationToken).ConfigureAwait(false);
        }

        return shift.Id;
    }
}
