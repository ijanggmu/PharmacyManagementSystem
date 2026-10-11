using System.Net;
using System.Text.Json;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.Sales;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.Sales.UpdateSale;

public static class UpdateSaleEndpoint
{
    internal static RouteHandlerBuilder MapUpdateSaleEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPut("/{saleId:guid}",
                async (Guid saleId, JsonElement body, IMediator mediator, CancellationToken ct) =>
                {
                    var command = ParseBody(saleId, body);
                    return Results.Ok(await mediator.Send(command, ct));
                })
            .WithName("UpdateSale")
            .WithSummary("Edit a sale. Only notes is editable; any other field is rejected with 400")
            .RequirePermission(SalesPermissions.Sales.Create);
    }

    /// <summary>
    /// The legacy PATCH accepted <c>payment_status</c> and <c>notes</c>. The .NET sale has no stored
    /// payment status (it is derived from the balance), so <c>payment_status</c> is refused explicitly
    /// and every other key is refused too, rather than being silently dropped.
    /// </summary>
    private static UpdateSaleCommand ParseBody(Guid saleId, JsonElement body)
    {
        if (body.ValueKind != JsonValueKind.Object)
        {
            throw BadRequest("Request body must be a JSON object.");
        }

        foreach (var property in body.EnumerateObject())
        {
            if (property.NameEquals("notes"))
            {
                continue;
            }

            string message = property.NameEquals("payment_status") || property.NameEquals("paymentStatus")
                ? "payment_status cannot be set. A sale's payment state is derived from its balance due."
                : $"Field '{property.Name}' cannot be updated on a sale. Only notes is editable.";
            throw BadRequest(message);
        }

        if (!body.TryGetProperty("notes", out var notes))
        {
            return new UpdateSaleCommand(saleId, null, NotesProvided: false);
        }

        return notes.ValueKind switch
        {
            JsonValueKind.Null => new UpdateSaleCommand(saleId, null, NotesProvided: true),
            JsonValueKind.String => new UpdateSaleCommand(saleId, notes.GetString(), NotesProvided: true),
            _ => throw BadRequest("notes must be a string or null."),
        };
    }

    private static CustomException BadRequest(string message) =>
        new(message, (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
}
