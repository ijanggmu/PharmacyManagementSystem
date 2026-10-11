using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Shared.Multitenancy;

namespace FSH.Modules.Billing.Features.v1;

/// <summary>
/// Defence in depth for platform billing operations (plans, subscriptions, invoice lifecycle, top-up
/// approval). The endpoints already require the root-only <c>Billing.Manage</c> permission; this guard
/// additionally refuses any caller whose resolved tenant is not the root tenant, so a mis-seeded role
/// in a pharmacy tenant can never self-upgrade a plan or mark its own invoice paid.
/// </summary>
internal static class BillingOperatorGuard
{
    public static string EnsureRootOperator(IMultiTenantContextAccessor<AppTenantInfo> tenantAccessor, string action)
    {
        ArgumentNullException.ThrowIfNull(tenantAccessor);

        var callerTenantId = tenantAccessor.MultiTenantContext?.TenantInfo?.Id
            ?? throw new UnauthorizedException("Tenant context is required.");

        if (!string.Equals(callerTenantId, MultitenancyConstants.Root.Id, StringComparison.Ordinal))
        {
            throw new ForbiddenException($"Only the platform operator may {action}.");
        }

        return callerTenantId;
    }
}
