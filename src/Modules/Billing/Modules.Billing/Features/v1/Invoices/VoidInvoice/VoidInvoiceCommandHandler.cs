using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Billing.Contracts.v1.Invoices;
using FSH.Modules.Billing.Services;
using Mediator;

namespace FSH.Modules.Billing.Features.v1.Invoices.VoidInvoice;

public sealed class VoidInvoiceCommandHandler(
    IBillingService billing,
    IMultiTenantContextAccessor<AppTenantInfo> tenantAccessor)
    : ICommandHandler<VoidInvoiceCommand, Guid>
{
    public async ValueTask<Guid> Handle(VoidInvoiceCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        BillingOperatorGuard.EnsureRootOperator(tenantAccessor, "void invoices");
        await billing.VoidInvoiceAsync(command.InvoiceId, command.Reason, cancellationToken).ConfigureAwait(false);
        return command.InvoiceId;
    }
}
