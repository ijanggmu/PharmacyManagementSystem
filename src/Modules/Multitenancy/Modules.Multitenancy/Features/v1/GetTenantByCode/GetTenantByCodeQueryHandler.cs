using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Multitenancy.Contracts.Dtos;
using FSH.Modules.Multitenancy.Contracts.v1.GetTenantByCode;
using Mediator;

namespace FSH.Modules.Multitenancy.Features.v1.GetTenantByCode;

public sealed class GetTenantByCodeQueryHandler(ITenantService tenantService)
    : IQueryHandler<GetTenantByCodeQuery, TenantLookupDto>
{
    public async ValueTask<TenantLookupDto> Handle(GetTenantByCodeQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        var tenant = await tenantService.GetActiveByCodeAsync(query.Code, cancellationToken).ConfigureAwait(false);

        // Unknown and inactive codes answer the same, so the lookup doesn't reveal that an inactive pharmacy exists.
        return tenant.Code is null
            ? throw new NotFoundException("No active pharmacy uses this code.")
            : tenant;
    }
}
