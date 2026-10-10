using System.Net;
using System.Net.Http.Headers;
using System.Text;
using FSH.Modules.Sales.Services;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using NSubstitute;
using Shouldly;
using Xunit;

namespace Sales.Tests.Services;

public sealed class HttpIrdDispatchClientTests : IDisposable
{
    private const string TenantId = "acme";
    private const string Payload = "{\"invoiceNumber\":\"INV-260101-1234\",\"totalAmount\":10.5,\"items\":[]}";
    private static readonly Uri ExpectedUrl = new("https://cbms.example.test/api/v1/invoices");

    private readonly FakeHttpMessageHandler _handler;
    private readonly HttpIrdDispatchClient _sut;

    public HttpIrdDispatchClientTests()
    {
        _handler = new FakeHttpMessageHandler((_, _) => Task.FromResult(Json(HttpStatusCode.OK, "{\"invoiceId\":\"EXT-42\"}")));
        _sut = CreateClient(_handler, Configured());
    }

    // ---- Success / request shape --------------------------------------------------------------

    [Fact]
    public async Task SendInvoiceAsync_Should_Return_Success_With_ExternalId_When_Ird_Responds_2xx()
    {
        // Arrange — default handler answers 200 {"invoiceId":"EXT-42"}.

        // Act
        var result = await _sut.SendInvoiceAsync(TenantId, Payload, CancellationToken.None);

        // Assert
        result.Success.ShouldBeTrue();
        result.ExternalInvoiceId.ShouldBe("EXT-42");
        result.IsPermanentFailure.ShouldBeFalse();
        result.ErrorMessage.ShouldBeNull();
    }

    [Fact]
    public async Task SendInvoiceAsync_Should_Post_Payload_Verbatim_To_Configured_Url_With_Basic_Auth()
    {
        // Arrange
        var basic = Configured(authType: "basic", username: "pharmacy", password: "s3cret");
        var sut = CreateClient(_handler, basic);

        // Act
        await sut.SendInvoiceAsync(TenantId, Payload, CancellationToken.None);

        // Assert
        var request = _handler.Requests.ShouldHaveSingleItem();
        request.Method.ShouldBe(HttpMethod.Post);
        request.RequestUri.ShouldBe(ExpectedUrl);
        request.Content!.Headers.ContentType!.MediaType.ShouldBe("application/json");
        _handler.RequestBodies.ShouldHaveSingleItem().ShouldBe(Payload);
        request.Headers.Authorization.ShouldBe(new AuthenticationHeaderValue(
            "Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes("pharmacy:s3cret"))));
    }

    [Fact]
    public async Task SendInvoiceAsync_Should_Send_Bearer_Token_When_AuthType_Is_Bearer()
    {
        // Arrange — Configured() defaults to bearer with token "tok-123".

        // Act
        await _sut.SendInvoiceAsync(TenantId, Payload, CancellationToken.None);

        // Assert
        var request = _handler.Requests.ShouldHaveSingleItem();
        request.Headers.Authorization.ShouldBe(new AuthenticationHeaderValue("Bearer", "tok-123"));
    }

    [Fact]
    public async Task SendInvoiceAsync_Should_Return_Success_Without_ExternalId_When_2xx_Body_Is_Not_Json()
    {
        // Arrange — the reference treats a non-JSON 2xx as success with no external id.
        using var handler = new FakeHttpMessageHandler((_, _) => Task.FromResult(
            new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("ACCEPTED") }));

        // Act
        var result = await CreateClient(handler, Configured()).SendInvoiceAsync(TenantId, Payload, CancellationToken.None);

        // Assert
        result.Success.ShouldBeTrue();
        result.ExternalInvoiceId.ShouldBeNull();
    }

    // ---- Response classification --------------------------------------------------------------

    [Theory]
    [InlineData(HttpStatusCode.BadRequest)]
    [InlineData(HttpStatusCode.Unauthorized)]
    [InlineData(HttpStatusCode.UnprocessableEntity)]
    public async Task SendInvoiceAsync_Should_Return_Permanent_Failure_When_Ird_Responds_4xx(HttpStatusCode status)
    {
        // Arrange
        using var handler = new FakeHttpMessageHandler((_, _) => Task.FromResult(Json(status, "{\"message\":\"invoice rejected\"}")));

        // Act
        var result = await CreateClient(handler, Configured()).SendInvoiceAsync(TenantId, Payload, CancellationToken.None);

        // Assert
        result.Success.ShouldBeFalse();
        result.IsPermanentFailure.ShouldBeTrue();
        result.ErrorMessage!.ShouldContain("invoice rejected");
        result.ErrorMessage!.ShouldContain(((int)status).ToString(System.Globalization.CultureInfo.InvariantCulture));
    }

    [Theory]
    [InlineData(HttpStatusCode.InternalServerError)]
    [InlineData(HttpStatusCode.BadGateway)]
    [InlineData(HttpStatusCode.ServiceUnavailable)]
    [InlineData(HttpStatusCode.RequestTimeout)]
    [InlineData(HttpStatusCode.TooManyRequests)]
    public async Task SendInvoiceAsync_Should_Return_Transient_Failure_When_Ird_Responds_5xx_Or_Retryable_4xx(HttpStatusCode status)
    {
        // Arrange
        using var handler = new FakeHttpMessageHandler((_, _) => Task.FromResult(Json(status, "{\"error\":\"try later\"}")));

        // Act
        var result = await CreateClient(handler, Configured()).SendInvoiceAsync(TenantId, Payload, CancellationToken.None);

        // Assert
        result.Success.ShouldBeFalse();
        result.IsPermanentFailure.ShouldBeFalse();
        result.ErrorMessage!.ShouldContain("try later");
    }

    // ---- Transport failures --------------------------------------------------------------------

    [Fact]
    public async Task SendInvoiceAsync_Should_Return_Transient_Failure_When_Request_Times_Out()
    {
        // Arrange — the remote side never answers; the per-tenant deadline (50 ms) must cut it off.
        using var handler = new FakeHttpMessageHandler(async (_, ct) =>
        {
            await Task.Delay(Timeout.Infinite, ct);
            return Json(HttpStatusCode.OK, "{}");
        });
        var sut = CreateClient(handler, Configured(timeoutMs: 50));

        // Act
        var result = await sut.SendInvoiceAsync(TenantId, Payload, CancellationToken.None);

        // Assert
        result.Success.ShouldBeFalse();
        result.IsPermanentFailure.ShouldBeFalse();
        result.ErrorMessage!.ShouldContain("did not respond within 50 ms");
    }

    [Fact]
    public async Task SendInvoiceAsync_Should_Return_Transient_Failure_When_Network_Error_Occurs()
    {
        // Arrange
        using var handler = new FakeHttpMessageHandler((_, _) => throw new HttpRequestException("connection reset"));

        // Act
        var result = await CreateClient(handler, Configured()).SendInvoiceAsync(TenantId, Payload, CancellationToken.None);

        // Assert
        result.Success.ShouldBeFalse();
        result.IsPermanentFailure.ShouldBeFalse();
        result.ErrorMessage!.ShouldContain("connection reset");
    }

    [Fact]
    public async Task SendInvoiceAsync_Should_Propagate_Cancellation_When_Caller_Cancels()
    {
        // Arrange — shutdown of the job host must not be recorded as a failed attempt.
        using var handler = new FakeHttpMessageHandler(async (_, ct) =>
        {
            await Task.Delay(Timeout.Infinite, ct);
            return Json(HttpStatusCode.OK, "{}");
        });
        using var cts = new CancellationTokenSource();
        await cts.CancelAsync();

        // Act / Assert
        await Should.ThrowAsync<OperationCanceledException>(() =>
            CreateClient(handler, Configured()).SendInvoiceAsync(TenantId, Payload, cts.Token));
    }

    // ---- Configuration -------------------------------------------------------------------------

    [Fact]
    public async Task SendInvoiceAsync_Should_Return_Permanent_Failure_And_Not_Call_Ird_When_Tenant_Not_Configured()
    {
        // Arrange — options exist, but not for this tenant.
        var sut = CreateClient(_handler, new IrdOptions());

        // Act
        var result = await sut.SendInvoiceAsync(TenantId, Payload, CancellationToken.None);

        // Assert
        result.Success.ShouldBeFalse();
        result.IsPermanentFailure.ShouldBeTrue();
        result.ErrorMessage!.ShouldContain($"not configured for tenant '{TenantId}'");
        _handler.Requests.ShouldBeEmpty();
    }

    [Fact]
    public async Task SendInvoiceAsync_Should_Return_Permanent_Failure_And_Not_Call_Ird_When_Tenant_Id_Is_Empty()
    {
        // Act
        var result = await _sut.SendInvoiceAsync(string.Empty, Payload, CancellationToken.None);

        // Assert
        result.IsPermanentFailure.ShouldBeTrue();
        _handler.Requests.ShouldBeEmpty();
    }

    [Fact]
    public async Task SendInvoiceAsync_Should_Return_Permanent_Failure_And_Not_Call_Ird_When_Basic_Auth_Credentials_Missing()
    {
        // Arrange
        var sut = CreateClient(_handler, Configured(authType: "basic", username: "pharmacy", password: null));

        // Act
        var result = await sut.SendInvoiceAsync(TenantId, Payload, CancellationToken.None);

        // Assert
        result.IsPermanentFailure.ShouldBeTrue();
        result.ErrorMessage!.ShouldContain("basic auth needs Username and Password");
        _handler.Requests.ShouldBeEmpty();
    }

    [Fact]
    public async Task SendInvoiceAsync_Should_Return_Permanent_Failure_And_Not_Call_Ird_When_Bearer_Token_Missing()
    {
        // Arrange
        var sut = CreateClient(_handler, Configured(token: null));

        // Act
        var result = await sut.SendInvoiceAsync(TenantId, Payload, CancellationToken.None);

        // Assert
        result.IsPermanentFailure.ShouldBeTrue();
        result.ErrorMessage!.ShouldContain("bearer auth needs Token");
        _handler.Requests.ShouldBeEmpty();
    }

    [Fact]
    public async Task SendInvoiceAsync_Should_Return_Permanent_Failure_And_Not_Call_Ird_When_AuthType_Unsupported()
    {
        // Arrange
        var sut = CreateClient(_handler, Configured(authType: "oauth"));

        // Act
        var result = await sut.SendInvoiceAsync(TenantId, Payload, CancellationToken.None);

        // Assert
        result.IsPermanentFailure.ShouldBeTrue();
        result.ErrorMessage!.ShouldContain("Unsupported IRD CBMS AuthType 'oauth'");
        _handler.Requests.ShouldBeEmpty();
    }

    [Fact]
    public async Task SendInvoiceAsync_Should_Return_Permanent_Failure_And_Not_Call_Ird_When_BaseUrl_Missing()
    {
        // Arrange
        var sut = CreateClient(_handler, Configured(baseUrl: null));

        // Act
        var result = await sut.SendInvoiceAsync(TenantId, Payload, CancellationToken.None);

        // Assert
        result.IsPermanentFailure.ShouldBeTrue();
        result.ErrorMessage!.ShouldContain("BaseUrl, EndpointPath and AuthType are required");
        _handler.Requests.ShouldBeEmpty();
    }

    public void Dispose() => _handler.Dispose();

    // ---- Helpers -------------------------------------------------------------------------------

    private static IrdOptions Configured(
        string? baseUrl = "https://cbms.example.test/",
        string? authType = "bearer",
        string? username = null,
        string? password = null,
        string? token = "tok-123",
        int? timeoutMs = null)
    {
        var options = new IrdOptions();
        options.Tenants[TenantId] = new IrdTenantOptions
        {
            BaseUrl = baseUrl,
            EndpointPath = "api/v1/invoices",
            AuthType = authType,
            Username = username,
            Password = password,
            Token = token,
            TimeoutMs = timeoutMs,
        };
        return options;
    }

    private static HttpIrdDispatchClient CreateClient(HttpMessageHandler handler, IrdOptions options)
    {
        var monitor = Substitute.For<IOptionsMonitor<IrdOptions>>();
        monitor.CurrentValue.Returns(options);
        return new HttpIrdDispatchClient(
            new FakeHttpClientFactory(handler),
            monitor,
            Substitute.For<ILogger<HttpIrdDispatchClient>>());
    }

    private static HttpResponseMessage Json(HttpStatusCode status, string body) =>
        new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
}
