using System.Net;
using System.Text;
using FSH.Modules.Sales.Services;
using Microsoft.Extensions.Logging;
using NSubstitute;

namespace Sales.Tests.Services;

public sealed class HttpIrdDispatchClientTests : IDisposable
{
    private const string Body = "{\"username\":\"u\",\"password\":\"p\",\"invoice_number\":\"INV-1\"}";
    private static readonly Uri BillUrl = new("https://cbms.example.test/api/bill");

    private HttpStatusCode _status = HttpStatusCode.OK;
    private string _responseBody = "200";
    private readonly FakeHttpMessageHandler _handler;
    private readonly HttpIrdDispatchClient _sut;

    public HttpIrdDispatchClientTests()
    {
        _handler = new FakeHttpMessageHandler((_, _) => Task.FromResult(
            new HttpResponseMessage(_status) { Content = new StringContent(_responseBody, Encoding.UTF8, "application/json") }));
        _sut = new HttpIrdDispatchClient(new FakeHttpClientFactory(_handler), Substitute.For<ILogger<HttpIrdDispatchClient>>());
    }

    private Task<IrdDispatchResult> SendAsync() =>
        _sut.SendAsync(new IrdDispatchRequest(BillUrl, Body, 5_000), CancellationToken.None);

    [Fact]
    public async Task SendAsync_Should_Post_Body_Verbatim_As_Json_Without_Auth_Header()
    {
        var result = await SendAsync();

        result.Success.ShouldBeTrue();
        result.ResponseCode.ShouldBe("200");
        var request = _handler.Requests.ShouldHaveSingleItem();
        request.Method.ShouldBe(HttpMethod.Post);
        request.RequestUri.ShouldBe(BillUrl);
        request.Content!.Headers.ContentType!.MediaType.ShouldBe("application/json");
        request.Headers.Authorization.ShouldBeNull();
        _handler.RequestBodies.ShouldHaveSingleItem().ShouldBe(Body);
    }

    [Theory]
    [InlineData("200", true, false)]
    [InlineData("101", true, false)]   // bill already exists: a re-sent bill CBMS already has
    [InlineData("\"200\"", true, false)]
    [InlineData("100", false, true)]   // credentials don't match
    [InlineData("104", false, true)]   // model invalid
    [InlineData("102", false, false)]  // error while saving
    [InlineData("103", false, false)]  // unknown error
    [InlineData("105", false, false)]  // referenced bill not there yet
    [InlineData("999", false, true)]
    public async Task SendAsync_Should_Classify_Cbms_Result_Codes(string body, bool success, bool permanent)
    {
        ArgumentNullException.ThrowIfNull(body);
        _responseBody = body;

        var result = await SendAsync();

        result.Success.ShouldBe(success);
        result.IsPermanentFailure.ShouldBe(permanent);
        result.ResponseCode.ShouldBe(body.Trim('"'));
    }

    [Theory]
    [InlineData(HttpStatusCode.InternalServerError, false)]
    [InlineData(HttpStatusCode.TooManyRequests, false)]
    [InlineData(HttpStatusCode.RequestTimeout, false)]
    [InlineData(HttpStatusCode.BadRequest, true)]
    [InlineData(HttpStatusCode.NotFound, true)]
    public async Task SendAsync_Should_Classify_Http_Errors(HttpStatusCode status, bool permanent)
    {
        _status = status;
        _responseBody = "{\"message\":\"nope\"}";

        var result = await SendAsync();

        result.Success.ShouldBeFalse();
        result.IsPermanentFailure.ShouldBe(permanent);
        result.ResponseCode.ShouldBe(((int)status).ToString(System.Globalization.CultureInfo.InvariantCulture));
        result.ErrorMessage!.ShouldContain("nope");
    }

    [Fact]
    public async Task SendAsync_Should_Treat_A_Non_Code_2xx_Body_As_Accepted_With_External_Id()
    {
        _responseBody = "{\"invoiceId\":\"EXT-42\"}";

        var result = await SendAsync();

        result.Success.ShouldBeTrue();
        result.ExternalInvoiceId.ShouldBe("EXT-42");
    }

    [Fact]
    public async Task SendAsync_Should_Report_Transient_Failure_On_Transport_Error()
    {
        using var failing = new FakeHttpMessageHandler((_, _) => throw new HttpRequestException("connection refused"));
        var sut = new HttpIrdDispatchClient(new FakeHttpClientFactory(failing), Substitute.For<ILogger<HttpIrdDispatchClient>>());

        var result = await sut.SendAsync(new IrdDispatchRequest(BillUrl, Body, 5_000), CancellationToken.None);

        result.Success.ShouldBeFalse();
        result.IsPermanentFailure.ShouldBeFalse();
        result.ErrorMessage!.ShouldContain("connection refused");
        result.ErrorMessage!.ShouldNotContain("\"p\"");
    }

    [Fact]
    public async Task SendAsync_Should_Report_Transient_Failure_When_Deadline_Passes()
    {
        using var slow = new FakeHttpMessageHandler(async (_, ct) =>
        {
            await Task.Delay(TimeSpan.FromSeconds(30), ct);
            return new HttpResponseMessage(HttpStatusCode.OK);
        });
        var sut = new HttpIrdDispatchClient(new FakeHttpClientFactory(slow), Substitute.For<ILogger<HttpIrdDispatchClient>>());

        var result = await sut.SendAsync(new IrdDispatchRequest(BillUrl, Body, 50), CancellationToken.None);

        result.Success.ShouldBeFalse();
        result.IsPermanentFailure.ShouldBeFalse();
        result.ErrorMessage!.ShouldContain("did not respond");
    }

    [Fact]
    public async Task SendAsync_Should_Rethrow_When_Caller_Cancels()
    {
        using var cts = new CancellationTokenSource();
        await cts.CancelAsync();

        await Should.ThrowAsync<OperationCanceledException>(
            () => _sut.SendAsync(new IrdDispatchRequest(BillUrl, Body, 5_000), cts.Token));
    }

    public void Dispose() => _handler.Dispose();
}
