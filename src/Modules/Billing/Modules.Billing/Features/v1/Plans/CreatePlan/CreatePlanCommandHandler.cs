using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Billing.Contracts.v1.Plans;
using FSH.Modules.Billing.Data;
using FSH.Modules.Billing.Domain;
using Mediator;

namespace FSH.Modules.Billing.Features.v1.Plans.CreatePlan;

public sealed class CreatePlanCommandHandler(
    BillingDbContext dbContext,
    IMultiTenantContextAccessor<AppTenantInfo> tenantAccessor)
    : ICommandHandler<CreatePlanCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreatePlanCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        BillingOperatorGuard.EnsureRootOperator(tenantAccessor, "create billing plans");

        var plan = BillingPlan.Create(command.Key, command.Name, command.Currency, command.MonthlyBasePrice,
            command.OverageRates, command.Interval, command.AnnualPrice);
        dbContext.Plans.Add(plan);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return plan.Id;
    }
}
