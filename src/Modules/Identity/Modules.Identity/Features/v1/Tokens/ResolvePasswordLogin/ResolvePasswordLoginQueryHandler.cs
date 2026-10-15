using FSH.Framework.Core.Exceptions;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Identity.Contracts.v1.ExternalLogins;
using FSH.Modules.Identity.Contracts.v1.Tokens.ResolvePasswordLogin;
using FSH.Modules.Multitenancy.Contracts.Dtos;
using FSH.Modules.Multitenancy.Contracts.v1.GetTenantByCode;
using Mediator;

namespace FSH.Modules.Identity.Features.v1.Tokens.ResolvePasswordLogin;

/// <summary>Lists the active pharmacies an email + password is valid in (sign-in without a pharmacy code).</summary>
public sealed class ResolvePasswordLoginQueryHandler(
    IIdentityService identityService,
    IMediator mediator) : IQueryHandler<ResolvePasswordLoginQuery, PasswordLoginResolution>
{
    public async ValueTask<PasswordLoginResolution> Handle(ResolvePasswordLoginQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var tenantIds = await identityService
            .FindPasswordLoginTenantsAsync(query.Email, query.Password, cancellationToken)
            .ConfigureAwait(false);

        var tenants = new List<GoogleLoginTenant>(tenantIds.Count);
        foreach (string tenantId in tenantIds.Order(StringComparer.Ordinal))
        {
            // Inactive or unknown tenants are left out (the lookup answers them with a 404).
            TenantLookupDto lookup;
            try
            {
                lookup = await mediator.Send(new GetTenantByCodeQuery(tenantId), cancellationToken).ConfigureAwait(false);
            }
            catch (NotFoundException)
            {
                continue;
            }

            if (lookup.Code is not null)
            {
                tenants.Add(new GoogleLoginTenant(lookup.Code, lookup.Name ?? lookup.Code));
            }
        }

        return new PasswordLoginResolution(tenants);
    }
}
