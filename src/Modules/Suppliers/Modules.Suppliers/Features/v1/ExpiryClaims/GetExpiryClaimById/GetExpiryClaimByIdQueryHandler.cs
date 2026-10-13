using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Contracts.v1.ExpiryClaims;
using FSH.Modules.Suppliers.Data;
using Mediator;

namespace FSH.Modules.Suppliers.Features.v1.ExpiryClaims.GetExpiryClaimById;

public sealed class GetExpiryClaimByIdQueryHandler(SuppliersDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetExpiryClaimByIdQuery, ExpiryClaimDto>
{
    public async ValueTask<ExpiryClaimDto> Handle(GetExpiryClaimByIdQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var claim = await ExpiryClaimMapper.LoadAsync(dbContext, currentBranch, query.ClaimId, cancellationToken)
            .ConfigureAwait(false);
        string? supplierName = await ExpiryClaimMapper.SupplierNameAsync(dbContext, claim.SupplierId, cancellationToken)
            .ConfigureAwait(false);
        return ExpiryClaimMapper.ToDto(claim, supplierName);
    }
}
