using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Auditing;
using FSH.Modules.Auditing.Contracts;
using Microsoft.AspNetCore.Http;

namespace Auditing.Tests.Http;

/// <summary>
/// A request that throws must still produce an Activity row (with the status the global exception
/// handler will send) so the system log shows every API call, and the Exception record must share
/// its correlation id. Uses the static <see cref="Audit"/> publisher, so runs non-parallel.
/// </summary>
[Collection(StaticAuditPublisherGroup.Name)]
public sealed class AuditHttpMiddlewareFailureTests
{
    private sealed class RecordingPublisher : IAuditPublisher
    {
        public List<IAuditEvent> Events { get; } = [];

        public IAuditScope CurrentScope { get; } =
            new DefaultAuditScope("tenant-a", "user-1", "alice", null, null, "corr-123", "req-1", null, AuditTag.None);

        public ValueTask PublishAsync(IAuditEvent auditEvent, CancellationToken ct = default)
        {
            lock (Events)
            {
                Events.Add(auditEvent);
            }
            return ValueTask.CompletedTask;
        }
    }

    private static DefaultHttpContext NewContext(string method = "POST", string path = "/api/v1/sales/abc", string? query = "?q=x&token=secret")
    {
        var ctx = new DefaultHttpContext();
        ctx.Request.Method = method;
        ctx.Request.Path = path;
        if (query is not null)
        {
            ctx.Request.QueryString = new QueryString(query);
        }
        ctx.Request.Headers.UserAgent = "UnitTest/1.0";
        ctx.Connection.RemoteIpAddress = IPAddress.Parse("10.1.2.3");
        ctx.Response.Body = new MemoryStream();
        return ctx;
    }

    private static async Task<RecordingPublisher> InvokeThrowingAsync(Exception toThrow, HttpContext ctx)
    {
        var publisher = new RecordingPublisher();
        Audit.Configure(publisher);
        var middleware = new AuditHttpMiddleware(_ => throw toThrow, new AuditHttpOptions(), publisher);

        var thrown = await Should.ThrowAsync<Exception>(() => middleware.InvokeAsync(ctx));
        if (toThrow is OperationCanceledException)
        {
            // An awaited cancelled task surfaces as TaskCanceledException — still a cancellation.
            thrown.ShouldBeAssignableTo<OperationCanceledException>();
        }
        else
        {
            thrown.ShouldBeSameAs(toThrow);
        }
        return publisher;
    }

    [Fact]
    public async Task Failed_Request_Should_Write_Activity_With_Mapped_Status_And_Exception_With_Same_Correlation()
    {
        var ctx = NewContext();
        var publisher = await InvokeThrowingAsync(new InvalidOperationException("boom"), ctx);

        var activity = publisher.Events.Single(e => e.EventType == AuditEventType.Activity);
        var payload = activity.Payload.ShouldBeOfType<ActivityEventPayload>();
        payload.StatusCode.ShouldBe(500);
        payload.Method.ShouldBe("POST");
        payload.Name.ShouldBe("/api/v1/sales/abc");
        payload.QueryString.ShouldBe("?q=x&token=****");
        payload.ClientIp.ShouldBe("10.1.2.3");
        payload.UserAgent.ShouldBe("UnitTest/1.0");
        payload.ErrorType.ShouldBe(typeof(InvalidOperationException).FullName);
        activity.Severity.ShouldBe(AuditSeverity.Error);

        var exception = publisher.Events.Single(e => e.EventType == AuditEventType.Exception);
        exception.CorrelationId.ShouldBe("corr-123");
        activity.CorrelationId.ShouldBe(exception.CorrelationId);
    }

    [Fact]
    public async Task NotFound_Should_Be_Recorded_As_404_Activity()
    {
        var publisher = await InvokeThrowingAsync(new NotFoundException("missing"), NewContext(method: "GET", query: null));

        var payload = publisher.Events.Single(e => e.EventType == AuditEventType.Activity)
            .Payload.ShouldBeOfType<ActivityEventPayload>();
        payload.StatusCode.ShouldBe(404);
        payload.QueryString.ShouldBeNull();
    }

    [Fact]
    public async Task Cancelled_Request_Should_Write_499_Activity_And_No_Exception_Record()
    {
        var publisher = await InvokeThrowingAsync(new OperationCanceledException(), NewContext(method: "GET"));

        publisher.Events.Count(e => e.EventType == AuditEventType.Exception).ShouldBe(0);
        publisher.Events.Single(e => e.EventType == AuditEventType.Activity)
            .Payload.ShouldBeOfType<ActivityEventPayload>()
            .StatusCode.ShouldBe(AuditExceptionStatusMapper.ClientClosedRequest);
    }

    [Fact]
    public async Task Successful_Request_Should_Capture_Method_And_Masked_Query()
    {
        var publisher = new RecordingPublisher();
        Audit.Configure(publisher);
        var ctx = NewContext(method: "GET", query: "?page=2&apiKey=abc");
        var middleware = new AuditHttpMiddleware(c =>
        {
            c.Response.StatusCode = 201;
            return Task.CompletedTask;
        }, new AuditHttpOptions(), publisher);

        await middleware.InvokeAsync(ctx);

        var payload = publisher.Events.Single().Payload.ShouldBeOfType<ActivityEventPayload>();
        payload.StatusCode.ShouldBe(201);
        payload.Method.ShouldBe("GET");
        payload.QueryString.ShouldBe("?page=2&apiKey=****");
        payload.ErrorType.ShouldBeNull();
    }
}

[CollectionDefinition(Name, DisableParallelization = true)]
public sealed class StaticAuditPublisherGroup
{
    public const string Name = "static-audit-publisher";

    private StaticAuditPublisherGroup()
    {
    }
}
