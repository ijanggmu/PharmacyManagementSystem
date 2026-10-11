using FSH.Framework.Core.Exceptions;
using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Contracts.v1.Returns;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Features.v1.Returns;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Features.v1.Returns.GetSupplierReturnById;

public sealed class GetSupplierReturnByIdQueryHandler(SuppliersDbContext dbContext)
    : IQueryHandler<GetSupplierReturnByIdQuery, SupplierReturnDto>
{
    public async ValueTask<SupplierReturnDto> Handle(GetSupplierReturnByIdQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var entity = await dbContext.SupplierReturns
            .AsNoTracking()
            .Include(r => r.Items)
            .FirstOrDefaultAsync(r => r.Id == query.ReturnId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Supplier return {query.ReturnId} not found.");

        return entity.ToDto();
    }
}
