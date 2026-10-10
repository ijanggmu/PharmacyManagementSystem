using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Billing.Contracts.Dtos;
using FSH.Modules.Billing.Contracts.v1.Subscriptions;
using FSH.Modules.Billing.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Billing.Features.v1.Subscriptions.GetSubscriptions;

/// <summary>
/// Cross-tenant listing is root-only: <see cref="Data.BillingDbContext"/> is not tenant-filtered, so
/// any other caller would otherwise see every tenant's subscription.
/// </summary>
public sealed class GetSubscriptionsQueryHandler(
    BillingDbContext dbContext,
    IMultiTenantContextAccessor<AppTenantInfo> tenantAccessor)
    : IQueryHandler<GetSubscriptionsQuery, IReadOnlyList<SubscriptionDto>>
{
    public async ValueTask<IReadOnlyList<SubscriptionDto>> Handle(GetSubscriptionsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var callerTenantId = tenantAccessor.MultiTenantContext?.TenantInfo?.Id
            ?? throw new UnauthorizedException("Tenant context is required.");
        if (callerTenantId != MultitenancyConstants.Root.Id)
        {
            throw new ForbiddenException("Only the root tenant may list subscriptions across tenants.");
        }

        // Latest subscription per tenant (by StartUtc) — reflects the current status even for a
        // tenant whose subscription was cancelled/suspended and never replaced.
        var rows = await (from s in dbContext.Subscriptions.AsNoTracking()
                           join p in dbContext.Plans.AsNoTracking() on s.PlanId equals p.Id
                           select new { s.Id, s.TenantId, s.PlanId, PlanKey = p.Key, PlanName = p.Name, s.StartUtc, s.EndUtc, s.Status })
                          .ToListAsync(cancellationToken).ConfigureAwait(false);

        return rows
            .GroupBy(r => r.TenantId)
            .Select(g => g.OrderByDescending(r => r.StartUtc).First())
            .Select(r => new SubscriptionDto(r.Id, r.TenantId, r.PlanId, r.PlanKey, r.StartUtc, r.EndUtc, r.Status, r.PlanName))
            .OrderBy(dto => dto.TenantId, StringComparer.Ordinal)
            .ToList();
    }
}
