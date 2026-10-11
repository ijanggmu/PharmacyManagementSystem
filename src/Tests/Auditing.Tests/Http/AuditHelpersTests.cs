using System.Net;
using FluentValidation.Results;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Auditing;
using FSH.Modules.Auditing.Contracts;
using Microsoft.AspNetCore.Http;
using System.Text.Json;

namespace Auditing.Tests.Http;

public sealed class AuditExceptionStatusMapperTests
{
    public static TheoryData<Exception, int> Cases => new()
    {
        { new FluentValidation.ValidationException([new ValidationFailure("Name", "required")]), 400 },
        { new NotFoundException("x"), 404 },
        { new ForbiddenException("x"), 403 },
        { new UnauthorizedException("x"), 401 },
        { new CustomException("conflict", [], HttpStatusCode.Conflict), 409 },
        { new UnauthorizedAccessException(), 401 },
        { new KeyNotFoundException(), 404 },
        { new BadHttpRequestException("bad", 413), 413 },
        { new OperationCanceledException(), 499 },
        { new TaskCanceledException(), 499 },
        { new InvalidOperationException(), 500 },
    };

    [Theory]
    [MemberData(nameof(Cases))]
    public void Map_Should_Mirror_Global_Exception_Handler(Exception ex, int expected) =>
        AuditExceptionStatusMapper.Map(ex).ShouldBe(expected);
}

public sealed class AuditQueryStringMaskerTests
{
    [Theory]
    [InlineData(null, null)]
    [InlineData("", null)]
    [InlineData("?", null)]
    [InlineData("?page=1&pageSize=20", "?page=1&pageSize=20")]
    [InlineData("?token=abc&page=1", "?token=****&page=1")]
    [InlineData("?access_token=abc", "?access_token=****")]
    [InlineData("?refreshToken=abc&password=p&clientSecret=s", "?refreshToken=****&password=****&clientSecret=****")]
    [InlineData("?apiKey=k&key=v&x-api-key=z", "?apiKey=****&key=****&x-api-key=****")]
    [InlineData("?code=123&otp=9&sig=abc", "?code=****&otp=****&sig=****")]
    [InlineData("search=para", "?search=para")]
    [InlineData("?flag", "?flag")]
    public void Mask_Should_Redact_Sensitive_Values(string? raw, string? expected) =>
        AuditQueryStringMasker.Mask(raw).ShouldBe(expected);

    [Theory]
    [InlineData("barcode")]
    [InlineData("productCode")]
    [InlineData("shipping")]
    [InlineData("design")]
    [InlineData("monkey")]
    [InlineData("sortKey2")]
    public void IsSensitiveKey_Should_Not_OverMask_Business_Filters(string key) =>
        AuditQueryStringMasker.IsSensitiveKey(key).ShouldBeFalse();

    [Fact]
    public void Mask_Should_Cap_Length()
    {
        var raw = "?" + string.Join('&', Enumerable.Range(0, 1000).Select(i => $"p{i}=value{i}"));
        var masked = AuditQueryStringMasker.Mask(raw)!;
        masked.Length.ShouldBeLessThanOrEqualTo(AuditQueryStringMasker.MaxLength + 1);
    }
}

public sealed class ActivityEventPayloadCompatibilityTests
{
    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() },
    };

    [Fact]
    public void Legacy_Payload_Without_Http_Fields_Should_Deserialize()
    {
        const string legacy = """
            {"kind":"Http","name":"/api/v1/x","captured":3,"durationMs":34,"statusCode":200,"requestSize":0,"responseSize":321}
            """;
        var payload = JsonSerializer.Deserialize<ActivityEventPayload>(legacy, Options)!;

        payload.Name.ShouldBe("/api/v1/x");
        payload.StatusCode.ShouldBe(200);
        payload.Method.ShouldBeNull();
        payload.QueryString.ShouldBeNull();
        payload.ClientIp.ShouldBeNull();
        payload.ErrorType.ShouldBeNull();
    }
}
