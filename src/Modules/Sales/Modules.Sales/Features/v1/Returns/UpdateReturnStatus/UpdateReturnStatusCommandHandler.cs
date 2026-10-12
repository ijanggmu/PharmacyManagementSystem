using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.v1.Returns;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Shared;
using FSH.Modules.Sales.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Returns.UpdateReturnStatus;

/// <summary>
/// Mirrors <c>PUT /api/returns/{id}</c> (app/api/returns/[id]/route.ts). Transitioning into
/// "completed" restores stock and posts the reversing voucher exactly once.
///
/// Runs in one transaction holding the parent sale's row lock (<see cref="SalesTransaction.LockSaleRowAsync"/>),
/// and re-reads the return under that lock, so two concurrent "complete" requests serialize and the second
/// sees the first one's completion (no double restock/posting). A rejected or completed return cannot change
/// status (<see cref="SaleReturn.SetStatus"/>), so a rejected return can't sneak back past the line cap.
/// </summary>
public sealed class UpdateReturnStatusCommandHandler(
    SalesDbContext dbContext,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    IMediator mediator,
    IInvoiceNumberService invoiceNumbers) : ICommandHandler<UpdateReturnStatusCommand, Guid>
{
    public async ValueTask<Guid> Handle(UpdateReturnStatusCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        ReturnStatus? newStatus = null;
        if (!string.IsNullOrWhiteSpace(command.Status))
        {
            if (!Enum.TryParse<ReturnStatus>(command.Status, ignoreCase: true, out var parsed))
            {
                throw new CustomException($"Invalid return status '{command.Status}'.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
            }

            newStatus = parsed;
        }

        var header = await dbContext.SaleReturns.AsNoTracking()
            .Where(r => r.Id == command.ReturnId)
            .Select(r => new { r.SaleId, r.BranchId, r.CustomerId })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Return {command.ReturnId} not found.");

        await currentBranch.EnsureCanSeeBranchAsync(header.BranchId, $"Return {command.ReturnId} not found.", cancellationToken)
            .ConfigureAwait(false);

        // Completion settles money and numbers the credit note: its cross-module reads happen before the transaction.
        ReversalContext? context = newStatus == ReturnStatus.Completed
            ? await SaleReversals.PrepareAsync(mediator, invoiceNumbers, header.BranchId, header.CustomerId, completing: true, cancellationToken).ConfigureAwait(false)
            : null;

        return await SalesTransaction.ExecuteAsync(
            dbContext,
            async ct =>
            {
                await SalesTransaction.LockSaleRowAsync(dbContext, header.SaleId, ct).ConfigureAwait(false);

                var saleReturn = await dbContext.SaleReturns
                    .Include(r => r.Items)
                    .FirstOrDefaultAsync(r => r.Id == command.ReturnId, ct)
                    .ConfigureAwait(false)
                    ?? throw new NotFoundException($"Return {command.ReturnId} not found.");

                if (newStatus is { } status)
                {
                    saleReturn.SetStatus(status);
                }

                saleReturn.UpdateDetails(command.Reason, command.Notes);
                await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);

                if (newStatus == ReturnStatus.Completed && saleReturn.StockRestoredAtUtc is null)
                {
                    var sale = await dbContext.Sales
                        .Include(s => s.Items)
                        .Include(s => s.Payments)
                        .FirstOrDefaultAsync(s => s.Id == saleReturn.SaleId, ct)
                        .ConfigureAwait(false)
                        ?? throw new NotFoundException($"Sale {saleReturn.SaleId} not found.");

                    SaleReversals.EnsureReversible(sale, "return");
                    await SaleReversals.CompleteReturnAsync(
                            dbContext, outbox, invoiceNumbers, context!, currentUser.GetTenant(), sale, saleReturn, ct)
                        .ConfigureAwait(false);
                }

                return saleReturn.Id;
            },
            cancellationToken).ConfigureAwait(false);
    }
}
