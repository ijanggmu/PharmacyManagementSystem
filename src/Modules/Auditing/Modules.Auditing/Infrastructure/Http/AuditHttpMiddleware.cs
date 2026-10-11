using FSH.Framework.Shared.Auditing;
using FSH.Modules.Auditing.Contracts;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using System.Diagnostics;

namespace FSH.Modules.Auditing;

public sealed class AuditHttpMiddleware
{
    private readonly RequestDelegate _next;
    private readonly AuditHttpOptions _opts;
    private readonly IAuditPublisher _publisher;

    public AuditHttpMiddleware(RequestDelegate next, AuditHttpOptions opts, IAuditPublisher publisher)
        => (_next, _opts, _publisher) = (next, opts, publisher);

    public async Task InvokeAsync(HttpContext ctx)
    {
        ArgumentNullException.ThrowIfNull(ctx);

        if (ShouldSkip(ctx) || IsStreamingResponse(ctx))
        {
            await _next(ctx).ConfigureAwait(false);
            return;
        }

        // Endpoint-level opt-out via [NoAudit]. Two flavours:
        //   • full skip (default) — don't write any audit at all
        //   • body-only — record the activity but elide previews
        var noAudit = ctx.GetEndpoint()?.Metadata.GetMetadata<NoAuditAttribute>();
        if (noAudit is { BodyOnly: false })
        {
            await _next(ctx).ConfigureAwait(false);
            return;
        }
        bool suppressBodies = noAudit is { BodyOnly: true };

        var requestContext = await CaptureRequestAsync(ctx, suppressBodies);
        var sw = Stopwatch.StartNew();

        var originalBody = ctx.Response.Body;
        await using var responseBuffer = new MemoryStream();
        ctx.Response.Body = responseBuffer;

        try
        {
            await _next(ctx).ConfigureAwait(false);
            sw.Stop();

            await WriteSuccessAuditAsync(ctx, requestContext, responseBuffer, originalBody, sw, suppressBodies);
        }
        catch (Exception ex)
        {
            sw.Stop();
            ctx.Response.Body = originalBody;
            await WriteFailureAuditsAsync(ctx, requestContext, ex, sw);
            throw;
        }
    }

    /// <summary>
    /// A request that ends in an unhandled exception still gets an Activity row (so the system log
    /// shows every API call, failures included) with the status the global exception handler will
    /// send, plus the Exception record when it meets <see cref="AuditHttpOptions.MinExceptionSeverity"/>.
    /// Both share the same correlation id so the UI can link them. Auditing must never mask the
    /// original exception, so failures here are swallowed and the caller rethrows.
    /// </summary>
    private async Task WriteFailureAuditsAsync(HttpContext ctx, RequestCaptureContext requestContext, Exception ex, Stopwatch sw)
    {
        try
        {
            var statusCode = AuditExceptionStatusMapper.Map(ex);
            var builder = BuildActivity(ctx, requestContext, statusCode, respPreview: null, respSize: 0, respMaskedFields: 0, sw)
                .WithActivityError(ex.GetType().FullName);
            if (statusCode >= StatusCodes.Status500InternalServerError)
            {
                builder.WithSeverity(AuditSeverity.Error);
            }
            else if (statusCode != AuditExceptionStatusMapper.ClientClosedRequest)
            {
                builder.WithSeverity(AuditSeverity.Warning);
            }

            // RequestAborted may already be cancelled (that is often *why* we are here) — never let it drop the row.
            await builder.WriteAsync(CancellationToken.None);

            if (ex is not OperationCanceledException)
            {
                await WriteExceptionAuditAsync(ctx, ex);
            }
        }
        catch (Exception auditEx) when (auditEx is not OutOfMemoryException)
        {
            // Best effort — the request's own exception is what the caller must see.
        }
    }

    private async Task<RequestCaptureContext> CaptureRequestAsync(HttpContext ctx, bool suppressBodies)
    {
        object? reqPreview = null;
        int reqSize = 0;
        int maskedFields = 0;

        if (!suppressBodies && ShouldCaptureBody(ctx.Request.ContentType))
        {
            var masker = ctx.RequestServices.GetService<IAuditMaskingService>();
            (reqPreview, reqSize) = await HttpBodyReader.ReadRequestAsync(ctx, _opts.MaxRequestBytes, ctx.RequestAborted);

            if (reqPreview is not null && masker is not null)
            {
                var result = masker.ApplyMasking(reqPreview);
                reqPreview = result.Payload;
                maskedFields = result.MaskedFieldCount;
            }
        }

        return new RequestCaptureContext(reqPreview, reqSize, maskedFields);
    }

    private async Task WriteSuccessAuditAsync(
        HttpContext ctx,
        RequestCaptureContext requestContext,
        MemoryStream responseBuffer,
        Stream originalBody,
        Stopwatch sw,
        bool suppressBodies)
    {
        var (respPreview, respSize, respMasked) = await CaptureResponseAsync(ctx, responseBuffer, suppressBodies);

        await RestoreResponseBodyAsync(responseBuffer, originalBody, ctx);

        await WriteActivityAuditAsync(ctx, requestContext, respPreview, respSize, respMasked, sw);
    }

    private async Task<(object? Preview, int Size, int MaskedFields)> CaptureResponseAsync(HttpContext ctx, MemoryStream responseBuffer, bool suppressBodies)
    {
        if (suppressBodies || !ShouldCaptureBody(ctx.Response.ContentType))
        {
            return (null, 0, 0);
        }

        var masker = ctx.RequestServices.GetService<IAuditMaskingService>();
        responseBuffer.Position = 0;

        await using var respBuffer = new MemoryStream();
        await responseBuffer.CopyToAsync(respBuffer, ctx.RequestAborted);

        var (respPreview, respSize) = await HttpBodyReader.ReadResponseAsync(
            respBuffer, _opts.MaxResponseBytes, ctx.RequestAborted);

        int maskedFields = 0;
        if (respPreview is not null && masker is not null)
        {
            var result = masker.ApplyMasking(respPreview);
            respPreview = result.Payload;
            maskedFields = result.MaskedFieldCount;
        }

        return (respPreview, respSize, maskedFields);
    }

    private static async Task RestoreResponseBodyAsync(MemoryStream responseBuffer, Stream originalBody, HttpContext ctx)
    {
        responseBuffer.Position = 0;
        ctx.Response.Body = originalBody;

        if (responseBuffer.Length > 0)
        {
            await responseBuffer.CopyToAsync(originalBody, ctx.RequestAborted);
        }
    }

    private async Task WriteActivityAuditAsync(
        HttpContext ctx,
        RequestCaptureContext requestContext,
        object? respPreview,
        int respSize,
        int respMaskedFields,
        Stopwatch sw)
    {
        var builder = BuildActivity(ctx, requestContext, ctx.Response.StatusCode, respPreview, respSize, respMaskedFields, sw);
        if (ctx.Response.StatusCode >= StatusCodes.Status500InternalServerError)
        {
            builder.WithSeverity(AuditSeverity.Error);
        }
        else if (ctx.Response.StatusCode >= StatusCodes.Status400BadRequest)
        {
            builder.WithSeverity(AuditSeverity.Warning);
        }

        await builder.WriteAsync(ctx.RequestAborted);
    }

    private Audit.Builder BuildActivity(
        HttpContext ctx,
        RequestCaptureContext requestContext,
        int statusCode,
        object? respPreview,
        int respSize,
        int respMaskedFields,
        Stopwatch sw)
    {
        var builder = Audit.ForActivity(Contracts.ActivityKind.Http, ctx.Request.Path)
            .WithActivityResult(
                statusCode: statusCode,
                durationMs: (int)sw.Elapsed.TotalMilliseconds,
                captured: _opts.CaptureBodies ? BodyCapture.Both : BodyCapture.None,
                requestSize: requestContext.Size,
                responseSize: respSize,
                requestPreview: requestContext.Preview,
                responsePreview: respPreview)
            .WithHttpRequest(
                method: ctx.Request.Method,
                queryString: AuditQueryStringMasker.Mask(ctx.Request.QueryString),
                routeTemplate: ResolveRouteTemplate(ctx),
                clientIp: ctx.Connection.RemoteIpAddress?.ToString(),
                userAgent: Truncate(ctx.Request.Headers.UserAgent.ToString(), MaxUserAgentLength))
            .WithSource(AuditSourceResolver.Resolve(ctx))
            .WithTenant(_publisher.CurrentScope?.TenantId)
            .WithUser(_publisher.CurrentScope?.UserId, _publisher.CurrentScope?.UserName)
            .WithCorrelation(_publisher.CurrentScope?.CorrelationId ?? ctx.TraceIdentifier)
            .WithRequestId(_publisher.CurrentScope?.RequestId ?? ctx.TraceIdentifier);

        var tags = AuditTag.None;
        if (ctx.Items.TryGetValue(HttpContextItemKeys.QuotaRejected, out var flag) && flag is true)
        {
            tags |= AuditTag.OutOfQuota;
        }
        if (requestContext.MaskedFields > 0 || respMaskedFields > 0)
        {
            tags |= AuditTag.PiiMasked;
        }
        if (tags != AuditTag.None)
        {
            builder.WithTags(tags);
        }

        return builder;
    }

    private const int MaxUserAgentLength = 512;

    private static string? ResolveRouteTemplate(HttpContext ctx) =>
        (ctx.GetEndpoint() as RouteEndpoint)?.RoutePattern.RawText;

    private static string? Truncate(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Length <= max ? value : value[..max];
    }

    private async Task WriteExceptionAuditAsync(HttpContext ctx, Exception ex)
    {
        var sev = ExceptionSeverityClassifier.Classify(ex);
        if (sev < _opts.MinExceptionSeverity)
        {
            return;
        }

        await Audit.ForException(ex, ExceptionArea.Api, routeOrLocation: ctx.Request.Path, severity: sev)
            .WithSource(AuditSourceResolver.Resolve(ctx))
            .WithTenant(_publisher.CurrentScope?.TenantId)
            .WithUser(_publisher.CurrentScope?.UserId, _publisher.CurrentScope?.UserName)
            .WithCorrelation(_publisher.CurrentScope?.CorrelationId ?? ctx.TraceIdentifier)
            .WithRequestId(_publisher.CurrentScope?.RequestId ?? ctx.TraceIdentifier)
            .WriteAsync(CancellationToken.None);
    }

    private bool ShouldCaptureBody(string? contentType) =>
        _opts.CaptureBodies && ContentTypeHelper.IsJsonLike(contentType, _opts.AllowedContentTypes);

    private bool ShouldSkip(HttpContext ctx)
    {
        var path = ctx.Request.Path.Value ?? string.Empty;
        return _opts.ExcludePathStartsWith.Any(prefix =>
            path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase));
    }

    // Streaming responses (SSE / SignalR SSE) must never be buffered: the audit path buffers Response.Body and flushes
    // only when the handler returns, but a long-lived stream never returns, so the client would hang. Detect via Accept header and pass through.
    private static bool IsStreamingResponse(HttpContext ctx) =>
        ctx.Request.Headers.Accept.Any(static v =>
            v is not null && v.Contains("text/event-stream", StringComparison.OrdinalIgnoreCase));

    private readonly record struct RequestCaptureContext(object? Preview, int Size, int MaskedFields);
}