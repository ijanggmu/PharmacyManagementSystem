using System.Diagnostics;
using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Sales.Contracts.Events;
using FSH.Modules.Sales.Contracts.v1.Refunds;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Refunds.UpdateRefundStatus;

/// <summary>Mirrors <c>PUT /api/refunds/{id}</c> (app/api/refunds/[id]/route.ts). Transitioning into
/// "completed" posts the reversing voucher exactly once, guarded by
/// <see cref="SaleRefund.MarkAccountingPostedIfNeeded"/>.</summary>
public sealed class UpdateRefundStatusCommandHandler(
    SalesDbContext dbContext,
    IOutboxWriter outbox,
    ICurrentUser currentUser) : ICommandHandler<UpdateRefundStatusCommand, Guid>
{
    public async ValueTask<Guid> Handle(UpdateRefundStatusCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var refund = await dbContext.SaleRefunds
            .Include(r => r.Items)
            .FirstOrDefaultAsync(r => r.Id == command.RefundId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Refund {command.RefundId} not found.");

        RefundStatus? newStatus = null;
        if (!string.IsNullOrWhiteSpace(command.Status))
        {
            if (!Enum.TryParse<RefundStatus>(command.Status, ignoreCase: true, out var parsed))
            {
                throw new CustomException($"Invalid refund status '{command.Status}'.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
            }

            newStatus = parsed;
            refund.SetStatus(parsed);
        }

        refund.UpdateDetails(command.RefundReason, command.Notes);

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        if (newStatus == RefundStatus.Completed && refund.MarkAccountingPostedIfNeeded())
        {
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

            string correlationId = Activity.Current?.Id ?? Guid.NewGuid().ToString();
            await outbox.AddAsync(new RefundCompletedIntegrationEvent(
                Id: Guid.NewGuid(),
                OccurredOnUtc: DateTime.UtcNow,
                TenantId: currentUser.GetTenant(),
                CorrelationId: correlationId,
                Source: "Sales",
                RefundId: refund.Id,
                OriginalSaleId: refund.OriginalSaleId,
                BranchId: refund.BranchId,
                NetRefundAmount: refund.NetRefundAmount),
                cancellationToken).ConfigureAwait(false);
        }

        return refund.Id;
    }
}
