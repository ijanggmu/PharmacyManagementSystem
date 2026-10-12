using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.v1.Refunds;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Shared;
using FSH.Modules.Sales.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Refunds.UpdateRefundStatus;

/// <summary>Mirrors <c>PUT /api/refunds/{id}</c> (app/api/refunds/[id]/route.ts). Transitioning into
/// "completed" posts the reversing voucher exactly once. Same locking as
/// <c>UpdateReturnStatusCommandHandler</c>: one transaction holding the parent sale's row lock, the refund
/// re-read under it, so concurrent completions serialize; rejected/completed refunds are terminal.</summary>
public sealed class UpdateRefundStatusCommandHandler(
    SalesDbContext dbContext,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    IMediator mediator,
    IInvoiceNumberService invoiceNumbers) : ICommandHandler<UpdateRefundStatusCommand, Guid>
{
    public async ValueTask<Guid> Handle(UpdateRefundStatusCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        RefundStatus? newStatus = null;
        if (!string.IsNullOrWhiteSpace(command.Status))
        {
            if (!Enum.TryParse<RefundStatus>(command.Status, ignoreCase: true, out var parsed))
            {
                throw new CustomException($"Invalid refund status '{command.Status}'.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
            }

            newStatus = parsed;
        }

        var header = await dbContext.SaleRefunds.AsNoTracking()
            .Where(r => r.Id == command.RefundId)
            .Select(r => new { r.OriginalSaleId, r.BranchId, r.CustomerId })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Refund {command.RefundId} not found.");

        await currentBranch.EnsureCanSeeBranchAsync(header.BranchId, $"Refund {command.RefundId} not found.", cancellationToken)
            .ConfigureAwait(false);

        // Completion settles money and numbers the credit note: its cross-module reads happen before the transaction.
        ReversalContext? context = newStatus == RefundStatus.Completed
            ? await SaleReversals.PrepareAsync(mediator, invoiceNumbers, header.BranchId, header.CustomerId, completing: true, cancellationToken).ConfigureAwait(false)
            : null;

        return await SalesTransaction.ExecuteAsync(
            dbContext,
            async ct =>
            {
                await SalesTransaction.LockSaleRowAsync(dbContext, header.OriginalSaleId, ct).ConfigureAwait(false);

                var refund = await dbContext.SaleRefunds
                    .Include(r => r.Items)
                    .FirstOrDefaultAsync(r => r.Id == command.RefundId, ct)
                    .ConfigureAwait(false)
                    ?? throw new NotFoundException($"Refund {command.RefundId} not found.");

                if (newStatus is { } status)
                {
                    refund.SetStatus(status);
                }

                refund.UpdateDetails(command.RefundReason, command.Notes);
                await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);

                if (newStatus == RefundStatus.Completed && refund.AccountingPostedAtUtc is null)
                {
                    var sale = await dbContext.Sales
                        .Include(s => s.Items)
                        .Include(s => s.Payments)
                        .FirstOrDefaultAsync(s => s.Id == refund.OriginalSaleId, ct)
                        .ConfigureAwait(false)
                        ?? throw new NotFoundException($"Sale {refund.OriginalSaleId} not found.");

                    SaleReversals.EnsureReversible(sale, "refund");
                    await SaleReversals.CompleteRefundAsync(
                            dbContext, outbox, invoiceNumbers, context!, currentUser.GetTenant(), sale, refund, ct)
                        .ConfigureAwait(false);
                }

                return refund.Id;
            },
            cancellationToken).ConfigureAwait(false);
    }
}
