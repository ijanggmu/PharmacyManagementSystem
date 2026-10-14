using FSH.Framework.Web.Idempotency;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace FSH.Modules.Sales.Web;

/// <summary>
/// WithIdempotency() is opt-in (a request without the header passes through). Money-moving POSTs — a sale, a return,
/// a refund — must never be recorded twice by a retried request, so these endpoints reject a request that omits the key.
/// </summary>
internal static class IdempotencyKeyRequirement
{
    /// <summary>Adds the filter. <c>what</c> names the document a duplicate would create ("sale", "return", "refund").</summary>
    public static RouteHandlerBuilder RequireIdempotencyKey(this RouteHandlerBuilder builder, string what) =>
        builder.AddEndpointFilter((context, next) =>
        {
            var options = context.HttpContext.RequestServices.GetRequiredService<IOptions<IdempotencyOptions>>().Value;
            var key = context.HttpContext.Request.Headers[options.HeaderName].ToString();

            if (string.IsNullOrWhiteSpace(key))
            {
                return ValueTask.FromResult<object?>(TypedResults.Problem(
                    title: "Idempotency-Key header is required.",
                    detail: $"Send a unique {options.HeaderName} header with each {what} so a retried request cannot create a duplicate {what}.",
                    statusCode: StatusCodes.Status400BadRequest));
            }

            return next(context);
        });
}
