using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Billing.Contracts.v1.Wallets;
using FSH.Modules.Billing.Data;
using FSH.Modules.Billing.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Billing.Features.v1.Wallets.ApproveTopupRequest;

public sealed class ApproveTopupRequestCommandHandler(
    BillingDbContext db,
    IBillingService billing,
    IMultiTenantContextAccessor<AppTenantInfo> tenantAccessor)
    : ICommandHandler<ApproveTopupRequestCommand, Guid>
{
    public async ValueTask<Guid> Handle(ApproveTopupRequestCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        // Top-up approval credits the wallet — a tenant must never approve its own request.
        BillingOperatorGuard.EnsureRootOperator(tenantAccessor, "approve top-up requests");

        var request = await db.TopupRequests
            .FirstOrDefaultAsync(r => r.Id == command.Id, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Top-up request {command.Id} not found.");

        // Operate on the request's own tenant (the caller is the root operator).
        var invoice = await billing.CreateTopupInvoiceAsync(request.TenantId, command.Id, cancellationToken)
            .ConfigureAwait(false);

        return invoice.Id;
    }
}
