using System.Net;
using FSH.Modules.Notifications.Sms.Providers;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NSubstitute;

namespace Notifications.Tests.Sms;

/// <summary>
/// Request shaping and response classification for the Nepal gateways. The field names follow Sparrow's v2 and Aakash's
/// v3 published APIs (Sparrow: token, from, to, text; Aakash: auth_token, to, text) — they must be re-checked against the
/// gateways' current documentation before going live; these tests pin what the code sends.
/// </summary>
public sealed class SmsProviderTests
{
    private static readonly SmsSendRequest Request = new("9841234567", "Hello Ram", "PHARMA", "secret-token");

    [Fact]
    public void Sparrow_Form_Is_Token_From_To_Text()
    {
        var provider = Sparrow(new CapturingHandler(HttpStatusCode.OK, "{}"));

        var form = provider.BuildForm(Request);

        form.Select(f => f.Key).ShouldBe(["token", "from", "to", "text"]);
        form.Select(f => f.Value).ShouldBe(["secret-token", "PHARMA", "9841234567", "Hello Ram"]);
    }

    [Fact]
    public void Aakash_Form_Is_AuthToken_To_Text()
    {
        var provider = Aakash(new CapturingHandler(HttpStatusCode.OK, "{}"));

        var form = provider.BuildForm(Request);

        form.Select(f => f.Key).ShouldBe(["auth_token", "to", "text"]);
        form.Select(f => f.Value).ShouldBe(["secret-token", "9841234567", "Hello Ram"]);
    }

    [Fact]
    public async Task Sparrow_Posts_Form_To_Configured_Url_And_Reads_Success()
    {
        var handler = new CapturingHandler(HttpStatusCode.OK,
            """{"count":1,"response_code":200,"response":"1 mesages has been queued for delivery"}""");
        var provider = Sparrow(handler);

        var result = await provider.SendAsync(Request, CancellationToken.None);

        result.Success.ShouldBeTrue();
        result.ResponseCode.ShouldBe("200");
        handler.Method.ShouldBe(HttpMethod.Post);
        handler.Uri!.ToString().ShouldBe(SmsOptions.DefaultSparrowUrl);
        handler.ContentType.ShouldBe("application/x-www-form-urlencoded");
        handler.Body.ShouldBe("token=secret-token&from=PHARMA&to=9841234567&text=Hello+Ram");
    }

    [Fact]
    public async Task Aakash_Posts_Form_And_Sums_Credits()
    {
        var handler = new CapturingHandler(HttpStatusCode.OK,
            """{"error":false,"message":"1 messages has been queued","data":{"valid":[{"id":555,"mobile":"9841234567","credit":2,"status":"queued"}],"invalid":[]}}""");
        var provider = Aakash(handler);

        var result = await provider.SendAsync(Request, CancellationToken.None);

        result.Success.ShouldBeTrue();
        result.Credits.ShouldBe(2m);
        result.ProviderMessageId.ShouldBe("555");
        handler.Uri!.ToString().ShouldBe(SmsOptions.DefaultAakashUrl);
        handler.Body.ShouldBe("auth_token=secret-token&to=9841234567&text=Hello+Ram");
    }

    [Fact]
    public void Sparrow_Invalid_Token_Is_Permanent()
    {
        var result = Sparrow(new CapturingHandler(HttpStatusCode.OK, "{}"))
            .Classify(HttpStatusCode.Forbidden, """{"response_code":1002,"response":"Invalid Token"}""");

        result.Success.ShouldBeFalse();
        result.IsPermanentFailure.ShouldBeTrue();
        result.ResponseCode.ShouldBe("1002");
        result.Error!.ShouldContain("Invalid Token");
    }

    [Theory]
    [InlineData(HttpStatusCode.ServiceUnavailable)]
    [InlineData(HttpStatusCode.TooManyRequests)]
    [InlineData(HttpStatusCode.RequestTimeout)]
    public void Server_Errors_Are_Transient(HttpStatusCode status)
    {
        var provider = new CapturingHandler(HttpStatusCode.OK, "{}");
        Sparrow(provider).Classify(status, "").IsPermanentFailure.ShouldBeFalse();
        Aakash(provider).Classify(status, "").IsPermanentFailure.ShouldBeFalse();
    }

    [Fact]
    public void Aakash_Error_Flag_Is_Permanent()
    {
        var result = Aakash(new CapturingHandler(HttpStatusCode.OK, "{}"))
            .Classify(HttpStatusCode.OK, """{"error":true,"message":"Invalid token"}""");

        result.Success.ShouldBeFalse();
        result.IsPermanentFailure.ShouldBeTrue();
        result.ResponseMessage.ShouldBe("Invalid token");
    }

    [Fact]
    public void Aakash_Invalid_Number_Is_Permanent()
    {
        var result = Aakash(new CapturingHandler(HttpStatusCode.OK, "{}"))
            .Classify(HttpStatusCode.OK, """{"error":false,"message":"","data":{"valid":[],"invalid":[{"mobile":"123"}]}}""");

        result.IsPermanentFailure.ShouldBeTrue();
    }

    [Fact]
    public async Task Transport_Error_Is_Transient()
    {
        var provider = Sparrow(new ThrowingHandler());

        var result = await provider.SendAsync(Request, CancellationToken.None);

        result.Success.ShouldBeFalse();
        result.IsPermanentFailure.ShouldBeFalse();
    }

    [Fact]
    public void Request_ToString_Never_Shows_Token_Or_Full_Number()
    {
        string text = Request.ToString();
        text.ShouldNotContain("secret-token");
        text.ShouldNotContain("9841234567");
        text.ShouldContain("98******67");
    }

    [Fact]
    public async Task LogOnly_Accepts_Without_Sending()
    {
        var result = await new LogOnlySmsProvider(NullLogger<LogOnlySmsProvider>.Instance).SendAsync(Request, CancellationToken.None);
        result.Success.ShouldBeTrue();
        result.ResponseCode.ShouldBe("log-only");
    }

    private static SparrowSmsProvider Sparrow(HttpMessageHandler handler) =>
        new(Factory(handler), Options(), NullLogger<SparrowSmsProvider>.Instance);

    private static AakashSmsProvider Aakash(HttpMessageHandler handler) =>
        new(Factory(handler), Options(), NullLogger<AakashSmsProvider>.Instance);

    private static IHttpClientFactory Factory(HttpMessageHandler handler)
    {
        var factory = Substitute.For<IHttpClientFactory>();
        factory.CreateClient(Arg.Any<string>()).Returns(_ => new HttpClient(handler, disposeHandler: false));
        return factory;
    }

    private static IOptionsMonitor<SmsOptions> Options()
    {
        var monitor = Substitute.For<IOptionsMonitor<SmsOptions>>();
        monitor.CurrentValue.Returns(new SmsOptions());
        return monitor;
    }

    private sealed class CapturingHandler(HttpStatusCode status, string responseBody) : HttpMessageHandler
    {
        public HttpMethod? Method { get; private set; }
        public Uri? Uri { get; private set; }
        public string? ContentType { get; private set; }
        public string? Body { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Method = request.Method;
            Uri = request.RequestUri;
            ContentType = request.Content?.Headers.ContentType?.MediaType;
            Body = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
            return new HttpResponseMessage(status) { Content = new StringContent(responseBody) };
        }
    }

    private sealed class ThrowingHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            throw new HttpRequestException("connection refused");
    }
}
