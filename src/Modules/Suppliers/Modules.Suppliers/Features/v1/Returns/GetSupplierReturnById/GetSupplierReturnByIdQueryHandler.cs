using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Contracts.v1.Returns;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Features.v1.Returns;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Features.v1.Returns.GetSupplierReturnById;

/// <summary>One debit note. A caller who may not see the branch the goods left from gets "not found" (so other
/// branches' document ids don't leak); a legacy return without a branch stays visible.</summary>
public sealed class GetSupplierReturnByIdQueryHandler(SuppliersDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetSupplierReturnByIdQuery, SupplierReturnDto>
{
    public async ValueTask<SupplierReturnDto> Handle(GetSupplierReturnByIdQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        string notFound = $"Supplier return {query.ReturnId} not found.";
        var entity = await dbContext.SupplierReturns
            .AsNoTracking()
            .Include(r => r.Items)
            .FirstOrDefaultAsync(r => r.Id == query.ReturnId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException(notFound);
        await currentBranch.EnsureCanSeeBranchAsync(entity.BranchId, notFound, cancellationToken).ConfigureAwait(false);

        string? supplierName = await dbContext.Suppliers.AsNoTracking()
            .IgnoreQueryFilters([FSH.Framework.Persistence.QueryFilters.SoftDelete])
            .Where(s => s.Id == entity.SupplierId)
            .Select(s => s.Name)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

        return entity.ToDto(supplierName);
    }
}
