using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Billing.Contracts.v1.Invoices;
using FSH.Modules.Billing.Services;
using Mediator;

namespace FSH.Modules.Billing.Features.v1.Invoices.MarkInvoicePaid;

public sealed class MarkInvoicePaidCommandHandler(
    IBillingService billing,
    IMultiTenantContextAccessor<AppTenantInfo> tenantAccessor)
    : ICommandHandler<MarkInvoicePaidCommand, Guid>
{
    public async ValueTask<Guid> Handle(MarkInvoicePaidCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        BillingOperatorGuard.EnsureRootOperator(tenantAccessor, "mark invoices paid");
        await billing.MarkInvoicePaidAsync(command.InvoiceId, cancellationToken).ConfigureAwait(false);
        return command.InvoiceId;
    }
}
