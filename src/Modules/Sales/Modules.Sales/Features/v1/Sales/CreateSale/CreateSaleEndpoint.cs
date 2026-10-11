using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.Safety;
using FSH.Modules.Sales.Contracts.v1.Sales;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
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
            .RequireIdempotencyKey()
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
    private static async Task<IResult> HandleAsync(CreateSaleCommand command, IMediator mediator, CancellationToken ct)
    {
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

    /// <summary>
    /// WithIdempotency() is opt-in (a request without the header passes through). Checkout must never
    /// double-charge stock or the till, so this endpoint rejects a request that omits the key.
    /// </summary>
    private static RouteHandlerBuilder RequireIdempotencyKey(this RouteHandlerBuilder builder) =>
        builder.AddEndpointFilter(static (context, next) =>
        {
            var options = context.HttpContext.RequestServices.GetRequiredService<IOptions<IdempotencyOptions>>().Value;
            var key = context.HttpContext.Request.Headers[options.HeaderName].ToString();

            if (string.IsNullOrWhiteSpace(key))
            {
                return ValueTask.FromResult<object?>(TypedResults.Problem(
                    title: "Idempotency-Key header is required.",
                    detail: $"Send a unique {options.HeaderName} header with each sale so a retried request cannot create a duplicate sale.",
                    statusCode: StatusCodes.Status400BadRequest));
            }

            return next(context);
        });
}
