using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Sales.Contracts.Events;
using FSH.Modules.Sales.Services.Ird;

namespace FSH.Modules.Sales.IntegrationEventHandlers;

/// <summary>Queues a completed sale's bill for IRD CBMS (when the tenant has e-billing on). Runs off the outbox, so
/// only committed sales are reported; <see cref="IrdDocumentEnqueuer"/> then triggers an immediate dispatch.</summary>
public sealed class IrdSaleCompletedHandler(IrdDocumentEnqueuer queue) : IIntegrationEventHandler<SaleCompletedIntegrationEvent>
{
    public async Task HandleAsync(SaleCompletedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);
        await queue.EnqueueBillAsync(@event.SaleId, @event.TenantId, ct).ConfigureAwait(false);
    }
}

/// <summary>Queues a completed return's credit note for CBMS's bill-return endpoint.</summary>
public sealed class IrdReturnCompletedHandler(IrdDocumentEnqueuer queue) : IIntegrationEventHandler<ReturnCompletedIntegrationEvent>
{
    public async Task HandleAsync(ReturnCompletedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);
        await queue.EnqueueReturnAsync(@event.ReturnId, @event.TenantId, ct).ConfigureAwait(false);
    }
}

/// <summary>Queues a completed refund's credit note for CBMS's bill-return endpoint.</summary>
public sealed class IrdRefundCompletedHandler(IrdDocumentEnqueuer queue) : IIntegrationEventHandler<RefundCompletedIntegrationEvent>
{
    public async Task HandleAsync(RefundCompletedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);
        await queue.EnqueueRefundAsync(@event.RefundId, @event.TenantId, ct).ConfigureAwait(false);
    }
}

/// <summary>Reports a cancelled bill to CBMS as a full bill-return.</summary>
public sealed class IrdSaleCancelledHandler(IrdDocumentEnqueuer queue) : IIntegrationEventHandler<SaleCancelledIntegrationEvent>
{
    public async Task HandleAsync(SaleCancelledIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);
        await queue.EnqueueCancellationAsync(@event.SaleId, @event.TenantId, ct).ConfigureAwait(false);
    }
}
