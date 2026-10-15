using System.Text;
using FSH.Framework.Web.Idempotency;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;
using Xunit;

namespace Framework.Tests.Web;

/// <summary>What the idempotency filter keeps for a replay: the success's real body, nothing for a refusal.</summary>
public sealed class IdempotencyEndpointFilterTests
{
    private static DefaultHttpContext Context() =>
        new() { RequestServices = new ServiceCollection().AddOptions().BuildServiceProvider() };

    [Fact]
    public void Ok_Should_BeKeptWithItsValueAsTheBody_NotTheResultWrapper()
    {
        var id = Guid.Parse("01a13a1e-0000-7000-8000-000000000001");

        var cached = IdempotencyEndpointFilter.ToCachedResponse(Results.Ok(id), Context());

        cached.ShouldNotBeNull();
        cached.StatusCode.ShouldBe(200);
        Encoding.UTF8.GetString(cached.Body).ShouldBe($"\"{id}\"");
    }

    [Fact]
    public void PlainValue_Should_BeKeptAs200()
    {
        var cached = IdempotencyEndpointFilter.ToCachedResponse(new { saleId = 7 }, Context());

        cached.ShouldNotBeNull();
        cached.StatusCode.ShouldBe(200);
        Encoding.UTF8.GetString(cached.Body).ShouldBe("{\"saleId\":7}");
    }

    [Fact]
    public void NoContent_Should_BeKeptWithoutABody()
    {
        var cached = IdempotencyEndpointFilter.ToCachedResponse(Results.NoContent(), Context());

        cached.ShouldNotBeNull();
        cached.StatusCode.ShouldBe(204);
        cached.Body.ShouldBeEmpty();
    }

    [Fact]
    public void Refusal_Should_NotBeKept_SoARetryWithTheSameKeyCanSucceed()
    {
        IdempotencyEndpointFilter.ToCachedResponse(Results.Problem(statusCode: 409), Context()).ShouldBeNull();
        IdempotencyEndpointFilter.ToCachedResponse(Results.BadRequest("nope"), Context()).ShouldBeNull();
    }
}
