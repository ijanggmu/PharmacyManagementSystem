using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Consignment;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Consignment.GetConsignmentSettlementById;

public sealed class GetConsignmentSettlementByIdQueryHandler(InventoryDbContext dbContext, IMediator mediator, ICurrentBranch currentBranch)
    : IQueryHandler<GetConsignmentSettlementByIdQuery, ConsignmentSettlementDto>
{
    public async ValueTask<ConsignmentSettlementDto> Handle(GetConsignmentSettlementByIdQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var row = await dbContext.ConsignmentSettlements
            .AsNoTracking()
            .Where(s => s.Id == query.SettlementId)
            .Select(s => new ConsignmentSettlementDto(
                s.Id, s.SupplierId, s.BranchId, s.TotalAmount, s.PositionsSettledCount,
                s.SettlementDateUtc, s.SettledBy, s.CreatedAtUtc, null, s.VatAmount))
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Consignment settlement {query.SettlementId} not found.");
        await currentBranch.EnsureCanSeeBranchAsync(row.BranchId, $"Consignment settlement {query.SettlementId} not found.", cancellationToken).ConfigureAwait(false);

        var names = await SupplierNameResolver.ResolveAsync(mediator, [row.SupplierId], cancellationToken).ConfigureAwait(false);
        return row with { SupplierName = names.TryGetValue(row.SupplierId, out var name) ? name : null };
    }
}
