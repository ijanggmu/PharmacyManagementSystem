using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Payments;
using FSH.Modules.Sales.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NSubstitute;

namespace Sales.Tests.Services;

public sealed class FonepayClientTests
{
    private static readonly FonepayCredentials Credentials = new("dev", "MERCH01", "api-user", "api-pass", "s3cret");

    [Fact]
    public void Sign_Is_Lower_Hex_HmacSha512_Of_The_Message()
    {
        // HMAC-SHA512("key", "The quick brown fox jumps over the lazy dog"), a published test vector.
        HttpFonepayClient.Sign("key", "The quick brown fox jumps over the lazy dog")
            .ShouldBe("b42af09057bac1e2d41708e48a902e09b5ff7f12ab428a4fe86653c73dd248fb82f948a549f7b791a5b41915ee4d1ec3935357e4e2317250d0372afa2ebeeb3a");
    }

    [Theory]
    [InlineData("44.1", "44.10")]
    [InlineData("44", "44.00")]
    [InlineData("1234.567", "1234.57")]
    public void FormatAmount_Uses_Two_Decimals_Invariant(string input, string expected)
    {
        HttpFonepayClient.FormatAmount(decimal.Parse(input, System.Globalization.CultureInfo.InvariantCulture)).ShouldBe(expected);
    }

    [Fact]
    public async Task CreateQr_Sends_Signed_Body_And_Returns_QrMessage()
    {
        using var handler = new FakeHttpMessageHandler((_, _) => Task.FromResult(Json(HttpStatusCode.OK,
            """{"success":true,"qrMessage":"000201010212...","thirdpartyQrWebSocketUrl":"wss://ws.example/abc"}""")));
        var client = NewClient(handler);

        var result = await client.CreateQrAsync(Credentials, "PC1", 44.1m, "POS sale", "PC1", CancellationToken.None);

        result.Success.ShouldBeTrue();
        result.QrMessage.ShouldBe("000201010212...");
        result.WebSocketUrl.ShouldBe("wss://ws.example/abc");

        handler.Requests.Single().RequestUri!.ToString()
            .ShouldBe("https://dev.example/api/merchant/merchantDetailsForThirdParty/thirdPartyDynamicQrDownload");
        using var body = JsonDocument.Parse(handler.RequestBodies.Single()!);
        body.RootElement.GetProperty("amount").GetString().ShouldBe("44.10");
        body.RootElement.GetProperty("merchantCode").GetString().ShouldBe("MERCH01");
        body.RootElement.GetProperty("dataValidation").GetString()
            .ShouldBe(HttpFonepayClient.Sign("s3cret", "44.10,PC1,MERCH01,POS sale,PC1"));
    }

    [Fact]
    public async Task CreateQr_Reports_Gateway_Message_On_Rejection()
    {
        using var handler = new FakeHttpMessageHandler((_, _) => Task.FromResult(Json(HttpStatusCode.BadRequest,
            """{"success":false,"message":"Invalid data validation"}""")));

        var result = await NewClient(handler).CreateQrAsync(Credentials, "PC1", 10m, "a", "b", CancellationToken.None);

        result.Success.ShouldBeFalse();
        result.Error.ShouldBe("Invalid data validation");
    }

    [Fact]
    public async Task GetStatus_Signs_Prn_And_MerchantCode_And_Reads_Trace_Id()
    {
        using var handler = new FakeHttpMessageHandler((_, _) => Task.FromResult(Json(HttpStatusCode.OK,
            """{"paymentStatus":"success","fonepayTraceId":12345,"prn":"PC1"}""")));

        var result = await NewClient(handler).GetStatusAsync(Credentials, "PC1", CancellationToken.None);

        result.Reached.ShouldBeTrue();
        result.PaymentStatus.ShouldBe("success");
        result.TraceId.ShouldBe("12345");
        using var body = JsonDocument.Parse(handler.RequestBodies.Single()!);
        body.RootElement.GetProperty("dataValidation").GetString().ShouldBe(HttpFonepayClient.Sign("s3cret", "PC1,MERCH01"));
    }

    [Fact]
    public async Task Unreachable_Gateway_Is_Reported_Not_Thrown()
    {
        using var handler = new FakeHttpMessageHandler((_, _) => throw new HttpRequestException("no route"));

        var result = await NewClient(handler).GetStatusAsync(Credentials, "PC1", CancellationToken.None);

        result.Reached.ShouldBeFalse();
        result.Error.ShouldNotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task Missing_Dev_Url_Explains_What_To_Configure()
    {
        using var handler = new FakeHttpMessageHandler((_, _) => throw new InvalidOperationException("must not be called"));
        var options = Substitute.For<IOptionsMonitor<FonepayOptions>>();
        options.CurrentValue.Returns(new FonepayOptions { LiveBaseUrl = new Uri("https://live.example/api") });
        var client = new HttpFonepayClient(new FakeHttpClientFactory(handler), options, NullLogger<HttpFonepayClient>.Instance);

        var result = await client.CreateQrAsync(Credentials, "PC1", 10m, "a", "b", CancellationToken.None);

        result.Success.ShouldBeFalse();
        result.Error!.ShouldContain("DevBaseUrl");
        handler.Requests.ShouldBeEmpty();
    }

    [Theory]
    [InlineData("success", FonepayQrStatus.Success)]
    [InlineData("SUCCESS", FonepayQrStatus.Success)]
    [InlineData("failed", FonepayQrStatus.Failed)]
    [InlineData("pending", FonepayQrStatus.Pending)]
    [InlineData(null, FonepayQrStatus.Pending)]
    public void ParseStatus_Maps_Gateway_Values(string? value, FonepayQrStatus expected)
    {
        FonepayPrn.ParseStatus(value).ShouldBe(expected);
    }

    [Fact]
    public void Prn_Is_20_Characters_And_Unique()
    {
        string a = FonepayPrn.New();
        string b = FonepayPrn.New();
        a.Length.ShouldBe(20);
        a.ShouldStartWith("PC");
        a.ShouldNotBe(b);
    }

    [Fact]
    public void Paid_Qr_Cannot_Be_Reverted_By_A_Later_Check()
    {
        var request = FonepayQrRequest.Create("PC1", 44.1m, "dev");
        request.RecordCheck(FonepayQrStatus.Success, "T-1", null);
        request.RecordCheck(FonepayQrStatus.Failed, null, "late failure");

        request.Status.ShouldBe(FonepayQrStatus.Success);
        request.TraceId.ShouldBe("T-1");
        request.CompletedAtUtc.ShouldNotBeNull();
    }

    [Theory]
    [InlineData(null, true)]
    [InlineData("data:image/png;base64,AAAA", true)]
    [InlineData("data:image/webp;base64,AAAA", true)]
    [InlineData("data:image/svg+xml;base64,AAAA", false)]
    [InlineData("https://example.com/qr.png", false)]
    public void Qr_Image_Must_Be_A_Raster_Data_Url(string? image, bool accepted)
    {
        PaymentSettingsRules.IsAcceptedQrImage(image).ShouldBe(accepted);
    }

    [Fact]
    public void Fonepay_Is_Configured_Only_With_Every_Credential()
    {
        var settings = PaymentSettings.CreateDefault();
        settings.UpdateFonepay(true, "MERCH01", "api-user", "dev", passwordProtected: "enc-pass", secretKeyProtected: null);
        settings.IsFonepayConfigured.ShouldBeFalse();

        settings.UpdateFonepay(true, "MERCH01", "api-user", "dev", passwordProtected: null, secretKeyProtected: "enc-secret");
        settings.IsFonepayConfigured.ShouldBeTrue();
        settings.FonepayPasswordProtected.ShouldBe("enc-pass");
    }

    private static HttpFonepayClient NewClient(HttpMessageHandler handler)
    {
        var options = Substitute.For<IOptionsMonitor<FonepayOptions>>();
        options.CurrentValue.Returns(new FonepayOptions
        {
            DevBaseUrl = new Uri("https://dev.example/api"),
            LiveBaseUrl = new Uri("https://live.example/api"),
        });
        return new HttpFonepayClient(new FakeHttpClientFactory(handler), options, NullLogger<HttpFonepayClient>.Instance);
    }

    private static HttpResponseMessage Json(HttpStatusCode status, string json) =>
        new(status) { Content = new StringContent(json, Encoding.UTF8, "application/json") };
}
