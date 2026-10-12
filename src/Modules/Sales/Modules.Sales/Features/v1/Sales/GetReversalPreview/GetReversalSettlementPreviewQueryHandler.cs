using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.Sales;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Shared;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Sales.GetReversalPreview;

/// <summary>Previews <see cref="RefundMethods.Settle"/> for a sale with the same inputs completion uses (what
/// earlier returns/refunds already credited, the customer's current receivable). Read-only; the figure can
/// still change if the customer pays, or another return completes, before this one does.</summary>
public sealed class GetReversalSettlementPreviewQueryHandler(SalesDbContext dbContext, IMediator mediator, ICurrentBranch currentBranch)
    : IQueryHandler<GetReversalSettlementPreviewQuery, ReversalSettlementPreviewDto>
{
    public async ValueTask<ReversalSettlementPreviewDto> Handle(GetReversalSettlementPreviewQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var sale = await dbContext.Sales.AsNoTracking()
            .Include(s => s.Payments)
            .FirstOrDefaultAsync(s => s.Id == query.SaleId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Sale {query.SaleId} not found.");
        await currentBranch.EnsureCanSeeBranchAsync(sale.BranchId, $"Sale {query.SaleId} not found.", cancellationToken)
            .ConfigureAwait(false);

        decimal credited = await SaleReversals.OnAccountAlreadyCreditedAsync(dbContext, sale.Id, cancellationToken).ConfigureAwait(false);
        decimal? openBalance = await SaleReversals.CustomerOpenBalanceAsync(mediator, sale.CustomerId, cancellationToken).ConfigureAwait(false);

        var settlement = RefundMethods.Settle(sale, query.Amount, query.RefundMethod, credited, openBalance);
        return new ReversalSettlementPreviewDto(
            settlement.Cash, settlement.Bank, settlement.OnAccount, settlement.Total,
            RefundMethods.OnAccountCap(sale, credited, openBalance));
    }
}
