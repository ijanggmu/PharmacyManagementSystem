using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.Refunds;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Sales.RecordSalePrint;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Refunds.RecordRefundPrint;

/// <summary>
/// Appends a <see cref="RefundPrint"/> row. Prints are serialized by locking the original sale's row
/// (refunds have no lock helper of their own, and every refund of a sale already serializes on it);
/// the (RefundId, PrintNumber) unique index backs this up.
/// </summary>
public sealed class RecordRefundPrintCommandHandler(SalesDbContext dbContext, ICurrentUser currentUser)
    : ICommandHandler<RecordRefundPrintCommand, RefundPrintResultDto>
{
    public async ValueTask<RefundPrintResultDto> Handle(RecordRefundPrintCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        return await SalesTransaction.ExecuteAsync(
            dbContext,
            async ct =>
            {
                var refund = await dbContext.SaleRefunds
                    .AsNoTracking()
                    .Where(r => r.Id == command.RefundId)
                    .Select(r => new { r.Id, r.BranchId, r.OriginalSaleId, r.Status, r.CreditNoteNumber })
                    .FirstOrDefaultAsync(ct)
                    .ConfigureAwait(false)
                    ?? throw new NotFoundException($"Refund {command.RefundId} not found.");

                if (refund.Status == RefundStatus.Rejected || refund.CreditNoteNumber is null)
                {
                    throw new CustomException(
                        "This refund has no credit note to print.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
                }

                await SalesTransaction.LockSaleRowAsync(dbContext, refund.OriginalSaleId, ct).ConfigureAwait(false);

                int previous = await dbContext.RefundPrints
                    .CountAsync(p => p.RefundId == refund.Id, ct)
                    .ConfigureAwait(false);

                Guid userId = currentUser.GetUserId();
                string format = RecordSalePrintCommandValidator.Formats
                    .First(f => string.Equals(f, command.Format.Trim(), StringComparison.OrdinalIgnoreCase));
                var print = RefundPrint.Record(refund.Id, refund.BranchId, previous + 1, format, userId == Guid.Empty ? null : userId);

                dbContext.RefundPrints.Add(print);
                await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);

                return new RefundPrintResultDto(refund.Id, print.PrintNumber, print.PrintNumber > 1, print.PrintedAtUtc);
            },
            cancellationToken).ConfigureAwait(false);
    }
}
