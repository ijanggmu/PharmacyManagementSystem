using System.Diagnostics;
using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Sales.Contracts.Events;
using FSH.Modules.Sales.Contracts.v1.Returns;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Returns.UpdateReturnStatus;

/// <summary>
/// Mirrors <c>PUT /api/returns/{id}</c> (app/api/returns/[id]/route.ts). Transitioning into
/// "completed" restores stock and posts the reversing voucher exactly once (script 68's
/// <c>stock_restored_at</c> guard), covering the pending/approved -&gt; completed workflow the
/// Next.js PATCH handler supported, not just a return created already-completed.
/// </summary>
public sealed class UpdateReturnStatusCommandHandler(
    SalesDbContext dbContext,
    IOutboxWriter outbox,
    ICurrentUser currentUser) : ICommandHandler<UpdateReturnStatusCommand, Guid>
{
    public async ValueTask<Guid> Handle(UpdateReturnStatusCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var saleReturn = await dbContext.SaleReturns
            .Include(r => r.Items)
            .FirstOrDefaultAsync(r => r.Id == command.ReturnId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Return {command.ReturnId} not found.");

        ReturnStatus? newStatus = null;
        if (!string.IsNullOrWhiteSpace(command.Status))
        {
            if (!Enum.TryParse<ReturnStatus>(command.Status, ignoreCase: true, out var parsed))
            {
                throw new CustomException($"Invalid return status '{command.Status}'.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
            }

            newStatus = parsed;
            saleReturn.SetStatus(parsed);
        }

        saleReturn.UpdateDetails(command.Reason, command.Notes);

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        if (newStatus == ReturnStatus.Completed && saleReturn.MarkStockRestoredIfNeeded())
        {
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

            var lines = saleReturn.Items
                .Select(i => new ReturnCompletedLine(i.MedicineId, i.QuantityReturned, i.UnitCostPrice))
                .ToList();

            string correlationId = Activity.Current?.Id ?? Guid.NewGuid().ToString();
            await outbox.AddAsync(new ReturnCompletedIntegrationEvent(
                Id: Guid.NewGuid(),
                OccurredOnUtc: DateTime.UtcNow,
                TenantId: currentUser.GetTenant(),
                CorrelationId: correlationId,
                Source: "Sales",
                ReturnId: saleReturn.Id,
                SaleId: saleReturn.SaleId,
                BranchId: saleReturn.BranchId,
                TotalReturnAmount: saleReturn.TotalReturnAmount,
                Lines: lines),
                cancellationToken).ConfigureAwait(false);
        }

        return saleReturn.Id;
    }
}
