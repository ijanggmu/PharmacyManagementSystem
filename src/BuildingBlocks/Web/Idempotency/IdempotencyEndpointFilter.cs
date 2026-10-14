using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using FSH.Framework.Caching;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Metadata;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using HttpJsonOptions = Microsoft.AspNetCore.Http.Json.JsonOptions;

namespace FSH.Framework.Web.Idempotency;

/// <summary>
/// Endpoint filter that provides idempotency for POST/PUT/PATCH requests.
/// When an Idempotency-Key header is present, a successful response is cached and replayed
/// for subsequent requests with the same key.
/// </summary>
/// <remarks>
/// The entry is written and read through <see cref="IDistributedCache"/> as the same JSON document, so a replay
/// always reads what the first call wrote. (Writing through HybridCache stored its own payload envelope, which the
/// raw read could not parse, so every replay answered 500.) Only 2xx responses are kept: a refused request (a 409
/// safety warning, a validation error) must be able to succeed on a retry with the same key.
/// </remarks>
public sealed class IdempotencyEndpointFilter : IEndpointFilter
{
    private static readonly JsonSerializerOptions EnvelopeJson = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    private static readonly JsonSerializerOptions WebJson = new(JsonSerializerDefaults.Web);

    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(next);

        var httpContext = context.HttpContext;
        var options = httpContext.RequestServices.GetRequiredService<IOptions<IdempotencyOptions>>().Value;
        var idempotencyKey = httpContext.Request.Headers[options.HeaderName].ToString();

        // No header = pass through (idempotency is opt-in per request)
        if (string.IsNullOrWhiteSpace(idempotencyKey))
        {
            return await next(context).ConfigureAwait(false);
        }

        if (idempotencyKey.Length > options.MaxKeyLength)
        {
            return TypedResults.BadRequest($"Idempotency key exceeds maximum length of {options.MaxKeyLength}.");
        }

        var distributedCache = httpContext.RequestServices.GetRequiredService<IDistributedCache>();
        var logger = httpContext.RequestServices.GetRequiredService<ILogger<IdempotencyEndpointFilter>>();

        // Include tenant context in cache key for isolation
        var tenantId = httpContext.User.FindFirst("tenant")?.Value ?? "global";
        var cacheKey = CacheKeys.IdempotencyEntry(tenantId, idempotencyKey);

        var cached = await TryReadAsync(distributedCache, cacheKey, logger, httpContext.RequestAborted).ConfigureAwait(false);
        if (cached is not null)
        {
            if (logger.IsEnabled(LogLevel.Debug))
            {
                logger.LogDebug("Idempotent replay for key {KeyHash}", HashKey(idempotencyKey));
            }

            httpContext.Response.Headers["Idempotency-Replayed"] = "true";
            httpContext.Response.StatusCode = cached.StatusCode;
            if (cached.ContentType is not null)
            {
                httpContext.Response.ContentType = cached.ContentType;
            }

            if (cached.Body.Length > 0)
            {
                await httpContext.Response.Body.WriteAsync(cached.Body, httpContext.RequestAborted).ConfigureAwait(false);
            }

            return null; // Response already written
        }

        // Execute the handler
        var result = await next(context).ConfigureAwait(false);

        try
        {
            var responseToCache = ToCachedResponse(result, httpContext);
            if (responseToCache is not null)
            {
                var entryOptions = new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = options.DefaultTtl };
                await distributedCache.SetAsync(
                    cacheKey, JsonSerializer.SerializeToUtf8Bytes(responseToCache, EnvelopeJson), entryOptions, httpContext.RequestAborted)
                    .ConfigureAwait(false);
            }
        }
        // Best-effort caching: idempotency replay is a convenience, not a correctness requirement
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Failed to cache idempotent response for key {KeyHash}", HashKey(idempotencyKey));
        }

        return result;
    }

    /// <summary>
    /// The response a replay should send: the result's status code and its value serialized the way the endpoint
    /// serializes responses. Null when the response isn't a success (nothing is kept for those).
    /// </summary>
    public static CachedIdempotentResponse? ToCachedResponse(object? result, HttpContext httpContext)
    {
        ArgumentNullException.ThrowIfNull(httpContext);

        int status = result is IStatusCodeHttpResult { StatusCode: { } code } ? code : StatusCodes.Status200OK;
        if (status is < 200 or > 299)
        {
            return null;
        }

        object? value = result switch
        {
            null => null,
            IValueHttpResult valueResult => valueResult.Value,
            IResult => null, // e.g. NoContent: no body
            _ => result,
        };

        var serializerOptions = httpContext.RequestServices.GetService<IOptions<HttpJsonOptions>>()?.Value.SerializerOptions
            ?? WebJson;
        byte[] body = value is null ? [] : JsonSerializer.SerializeToUtf8Bytes(value, value.GetType(), serializerOptions);

        return new CachedIdempotentResponse
        {
            StatusCode = status,
            ContentType = body.Length > 0 ? "application/json; charset=utf-8" : null,
            Body = body,
        };
    }

    private static async Task<CachedIdempotentResponse?> TryReadAsync(
        IDistributedCache cache, string cacheKey, ILogger logger, CancellationToken cancellationToken)
    {
        var bytes = await cache.GetAsync(cacheKey, cancellationToken).ConfigureAwait(false);
        if (bytes is null || bytes.Length == 0)
        {
            return null;
        }

        try
        {
            var cached = JsonSerializer.Deserialize<CachedIdempotentResponse>(bytes, EnvelopeJson);
            return cached is { StatusCode: >= 200 and <= 299 } ? cached : null;
        }
        catch (JsonException ex)
        {
            // An entry written in an older format: treat it as a miss rather than fail the request.
            logger.LogWarning(ex, "Unreadable idempotency entry ignored");
            return null;
        }
    }

    private static string HashKey(string key)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(key));
        return Convert.ToHexString(hash.AsSpan(0, 8));
    }
}

public static class IdempotencyEndpointExtensions
{
    /// <summary>
    /// Enables idempotency for this endpoint. Requires Idempotency-Key header on requests.
    /// Duplicate requests with the same key return the cached response.
    /// </summary>
    public static RouteHandlerBuilder WithIdempotency(this RouteHandlerBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        return builder.AddEndpointFilter<IdempotencyEndpointFilter>();
    }
}
