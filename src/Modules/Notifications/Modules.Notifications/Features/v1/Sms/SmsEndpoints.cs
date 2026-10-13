using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Notifications.Contracts.v1.Sms;
using FSH.Modules.Reference.Contracts.Authorization;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Notifications.Features.v1.Sms;

// SMS endpoints reuse existing permissions (no new token claims): settings and the log are pharmacy settings
// (Reference.Settings.View / Update); a dues reminder is a collections action (Customers.Ledger.RecordPayment).

public static class GetSmsSettingsEndpoint
{
    internal static RouteHandlerBuilder MapGetSmsSettingsEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/sms/settings",
                async (IMediator mediator, CancellationToken ct) => Results.Ok(await mediator.Send(new GetSmsSettingsQuery(), ct)))
            .WithName("GetSmsSettings")
            .WithSummary("Get the SMS settings and templates (the gateway token is never returned)")
            .RequirePermission(ReferencePermissions.Settings.View);
}

public static class UpdateSmsSettingsEndpoint
{
    internal static RouteHandlerBuilder MapUpdateSmsSettingsEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPut("/sms/settings",
                async (UpdateSmsSettingsCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("UpdateSmsSettings")
            .WithSummary("Save the SMS settings and templates; a blank token keeps the stored one")
            .RequirePermission(ReferencePermissions.Settings.Update);
}

public static class SendTestSmsEndpoint
{
    internal static RouteHandlerBuilder MapSendTestSmsEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/sms/test",
                async (SendTestSmsCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("SendTestSms")
            .WithSummary("Queue a test SMS with the saved settings")
            .RequirePermission(ReferencePermissions.Settings.Update);
}

public static class SearchSmsMessagesEndpoint
{
    internal static RouteHandlerBuilder MapSearchSmsMessagesEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/sms/messages",
                async (int? pageNumber, int? pageSize, string? status, string? kind, Guid? customerId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(
                        new SearchSmsMessagesQuery(pageNumber ?? 1, pageSize ?? 20, status, kind, customerId), ct)))
            .WithName("SearchSmsMessages")
            .WithSummary("The SMS log, newest first (phone numbers masked)")
            .RequirePermission(ReferencePermissions.Settings.View);
}

public static class RetrySmsMessageEndpoint
{
    internal static RouteHandlerBuilder MapRetrySmsMessageEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/sms/messages/{id:guid}/retry",
                async (Guid id, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new RetrySmsMessageCommand(id), ct)))
            .WithName("RetrySmsMessage")
            .WithSummary("Put a failed SMS back in the queue")
            .RequirePermission(ReferencePermissions.Settings.Update);
}

public static class SendDuesReminderEndpoint
{
    internal static RouteHandlerBuilder MapSendDuesReminderEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/sms/dues-reminders",
                async (SendDuesReminderCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("SendDuesReminder")
            .WithSummary("Text a customer a reminder of what they owe")
            .RequirePermission(CustomersPermissions.Ledger.RecordPayment);
}
