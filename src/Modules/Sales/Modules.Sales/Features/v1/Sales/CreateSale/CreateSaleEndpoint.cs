using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.Safety;
using FSH.Modules.Sales.Contracts.v1.Sales;
using FSH.Modules.Sales.Web;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Options;

namespace FSH.Modules.Sales.Features.v1.Sales.CreateSale;

public static class CreateSaleEndpoint
{
    internal static RouteHandlerBuilder MapCreateSaleEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("", HandleAsync)
            .WithName("CreateSale")
            .WithSummary("Create and complete a sale: deducts stock (FEFO), posts the GL voucher, enforces dispensing safety")
            .RequirePermission(SalesPermissions.Sales.Create)
            .RequireIdempotencyKey("sale")
            .WithIdempotency();
    }

    /// <summary>
    /// <see cref="SafetyWarningException"/> (409: drug interaction / customer allergy) is caught here
    /// rather than left to <c>GlobalExceptionHandler</c> so the ProblemDetails body can carry the
    /// structured <c>warnings</c> payload (interactions + allergy match) the client needs to render
    /// the override dialog and resubmit with <c>acknowledgeWarnings: true</c> — every other exception
    /// (including the controlled-substance/prescription 409 from Prescriptions) still falls through to
    /// the global handler's standard ProblemDetails shape.
    /// </summary>
    private static async Task<IResult> HandleAsync(
        CreateSaleCommand command, IMediator mediator, HttpContext httpContext, IOptions<IdempotencyOptions> idempotency, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(command);
        ArgumentNullException.ThrowIfNull(httpContext);
        ArgumentNullException.ThrowIfNull(idempotency);

        // The checkout's Idempotency-Key is persisted on the sale (unique per tenant), so a replay of the same
        // key returns the sale already recorded — also while the first request is still in flight, which the
        // response-caching idempotency filter alone cannot catch.
        if (string.IsNullOrWhiteSpace(command.ClientRequestId))
        {
            string key = httpContext.Request.Headers[idempotency.Value.HeaderName].ToString();
            if (!string.IsNullOrWhiteSpace(key))
            {
                command = command with { ClientRequestId = key.Trim() };
            }
        }

        try
        {
            Guid saleId = await mediator.Send(command, ct).ConfigureAwait(false);
            return Results.Ok(saleId);
        }
        catch (SafetyWarningException ex)
        {
            return TypedResults.Problem(
                title: "SafetyWarningException",
                detail: ex.Message,
                statusCode: StatusCodes.Status409Conflict,
                extensions: new Dictionary<string, object?>
                {
                    ["errors"] = ex.ErrorMessages,
                    ["warnings"] = new { interactions = ex.Interactions, allergy = ex.Allergy },
                });
        }
    }
}
