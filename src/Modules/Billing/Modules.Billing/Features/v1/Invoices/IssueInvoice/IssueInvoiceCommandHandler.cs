using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Billing.Contracts.v1.Invoices;
using FSH.Modules.Billing.Services;
using Mediator;

namespace FSH.Modules.Billing.Features.v1.Invoices.IssueInvoice;

public sealed class IssueInvoiceCommandHandler(
    IBillingService billing,
    IMultiTenantContextAccessor<AppTenantInfo> tenantAccessor)
    : ICommandHandler<IssueInvoiceCommand, Guid>
{
    public async ValueTask<Guid> Handle(IssueInvoiceCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        BillingOperatorGuard.EnsureRootOperator(tenantAccessor, "issue invoices");
        await billing.IssueInvoiceAsync(command.InvoiceId, command.DueAtUtc, cancellationToken).ConfigureAwait(false);
        return command.InvoiceId;
    }
}
