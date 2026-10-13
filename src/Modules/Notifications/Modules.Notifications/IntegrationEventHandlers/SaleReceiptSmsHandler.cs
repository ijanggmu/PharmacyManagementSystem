using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Customers.Contracts.v1.Sms;
using FSH.Modules.Notifications.Contracts.v1.Sms;
using FSH.Modules.Notifications.Data;
using FSH.Modules.Notifications.Domain;
using FSH.Modules.Notifications.Sms;
using FSH.Modules.Sales.Contracts.Events;
using Mediator;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Notifications.IntegrationEventHandlers;

/// <summary>
/// The optional SMS receipt: when the cashier ticked "SMS receipt", queues a thank-you SMS with the bill number and total
/// to the number typed at checkout, or to the customer's phone. Receipts ignore quiet hours and do not depend on the
/// customer's SMS consent (the customer asked for it at the counter). Nothing is sent when the pharmacy has receipts or
/// SMS turned off, or there is no valid mobile number; the sale is never affected. Idempotent per sale.
/// </summary>
public sealed partial class SaleReceiptSmsHandler(
    NotificationsDbContext db,
    SmsComposer composer,
    SmsDispatchTrigger trigger,
    IMediator mediator,
    TimeProvider timeProvider,
    ILogger<SaleReceiptSmsHandler> logger)
    : IIntegrationEventHandler<SaleCompletedIntegrationEvent>
{
    public async Task HandleAsync(SaleCompletedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);
        if (!@event.SmsReceipt)
        {
            return;
        }

        var settings = await composer.GetSettingsAsync(ct).ConfigureAwait(false);
        if (settings is null || !settings.Enabled || !settings.ReceiptsEnabled || !settings.IsConfigured)
        {
            LogSkipped(logger, @event.SaleId, "SMS receipts are turned off");
            return;
        }

        string saleKey = SmsDedupe.SaleKey(@event.SaleId);
        if (await db.SmsMessages.AnyAsync(m => m.Kind == SmsKinds.Receipt && m.ReferenceKeys == saleKey, ct).ConfigureAwait(false))
        {
            return;
        }

        CustomerSmsContactDto? contact = null;
        if (@event.CustomerId is { } customerId)
        {
            var contacts = await mediator.Send(new GetCustomerSmsContactsQuery([customerId]), ct).ConfigureAwait(false);
            contact = contacts.Count > 0 ? contacts[0] : null;
        }

        string? phone = SmsPhone.Normalize(@event.SmsReceiptPhone ?? contact?.Phone);
        if (phone is null)
        {
            LogSkipped(logger, @event.SaleId, "no valid mobile number");
            return;
        }

        DateTime now = timeProvider.GetUtcNow().UtcDateTime;
        await composer.QueueAsync(
            settings, SmsKinds.Receipt, SmsTrigger.Manual, @event.CustomerId, contact?.Name, phone,
            SmsMessageValues.Receipt(contact?.Name, @event.InvoiceNumber, @event.TotalAmount, settings.DefaultLanguage),
            saleKey, requestedBy: null, now, ct).ConfigureAwait(false);
        await db.SaveChangesAsync(ct).ConfigureAwait(false);
        trigger.Trigger();
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "SMS receipt for sale {SaleId} not sent: {Reason}")]
    private static partial void LogSkipped(ILogger logger, Guid saleId, string reason);
}
