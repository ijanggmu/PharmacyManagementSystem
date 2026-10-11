using FSH.Modules.Files.Contracts.v1.Commands;
using FSH.Modules.Files.Features.v1.RequestUploadUrl;
using FSH.Modules.Files.Services;

namespace Files.Tests.Services;

public class FileContentTypesTests
{
    [Theory]
    [InlineData(".pdf", "application/pdf")]
    [InlineData(".PNG", "image/png")]
    [InlineData(".txt", "text/plain; charset=utf-8")]
    [InlineData(".jpg", "IMAGE/JPEG")]
    public void IsAllowed_Should_Accept_Matching_Types(string extension, string contentType) =>
        FileContentTypes.IsAllowed(extension, contentType).ShouldBeTrue();

    [Theory]
    [InlineData(".pdf", "text/html")]
    [InlineData(".png", "image/svg+xml")]
    [InlineData(".txt", "text/html")]
    [InlineData(".zip", "")]
    [InlineData("", "application/pdf")]
    [InlineData(".exe", "application/x-msdownload")]
    public void IsAllowed_Should_Reject_Mismatched_Types(string extension, string contentType) =>
        FileContentTypes.IsAllowed(extension, contentType).ShouldBeFalse();

    [Fact]
    public void IsAllowed_Should_Only_Accept_OctetStream_For_Unmapped_Extensions()
    {
        FileContentTypes.IsAllowed(".heic", "application/octet-stream").ShouldBeTrue();
        FileContentTypes.IsAllowed(".heic", "text/html").ShouldBeFalse();
    }

    [Theory]
    [InlineData("image/png", true, "inline")]
    [InlineData("application/pdf", true, "attachment")]
    [InlineData("text/plain", true, "attachment")]
    [InlineData("image/png", false, "attachment")]
    public void ContentDisposition_Should_Only_Allow_Inline_For_Safe_Images(string contentType, bool inline, string expectedMode) =>
        FileContentTypes.ContentDisposition("a.bin", contentType, inline).ShouldStartWith(expectedMode + ";");

    [Fact]
    public void ContentDisposition_Should_Escape_Quotes_And_Encode_Unicode()
    {
        string value = FileContentTypes.ContentDisposition("rep\"ort\r\nX-Evil: 1 नेपाल.pdf", "application/pdf", inlineRequested: false);

        value.ShouldNotContain("\r");
        value.ShouldNotContain("\n");
        value.ShouldContain("filename=\"rep_ort__X-Evil: 1 _____.pdf\"");
        value.ShouldContain("filename*=UTF-8''rep%22ort%0D%0AX-Evil%3A%201%20");
    }

    [Fact]
    public void Validator_Should_Reject_ContentType_Mismatch()
    {
        var validator = new RequestUploadUrlCommandValidator();
        var cmd = new RequestUploadUrlCommand("MyFiles", null, "invoice.pdf", "text/html", 100, default, "Document");

        validator.Validate(cmd).IsValid.ShouldBeFalse();
    }
}
