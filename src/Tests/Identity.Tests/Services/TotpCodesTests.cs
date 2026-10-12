using FSH.Modules.Identity.Features.v1.TwoFactor;

namespace Identity.Tests.Services;

/// <summary>RFC 6238 (SHA-1) test vectors for the TOTP helper behind the replay-protected authenticator provider.</summary>
public sealed class TotpCodesTests
{
    // Base32 of the RFC 6238 SHA-1 seed "12345678901234567890".
    private const string RfcKey = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

    [Theory]
    [InlineData(59L, "287082")]
    [InlineData(1111111109L, "081804")]
    [InlineData(1234567890L, "005924")]
    [InlineData(2000000000L, "279037")]
    public void GenerateCode_Should_Match_Rfc6238_Vectors(long unixSeconds, string expected)
    {
        TotpCodes.GenerateCode(RfcKey, DateTimeOffset.FromUnixTimeSeconds(unixSeconds)).ShouldBe(expected);
    }

    [Fact]
    public void FindMatchingTimeStep_Should_ReturnStep_When_CodeIsCurrent()
    {
        var now = DateTimeOffset.FromUnixTimeSeconds(1111111109);
        var code = TotpCodes.GenerateCode(RfcKey, now);

        TotpCodes.FindMatchingTimeStep(RfcKey, code, now).ShouldBe(1111111109L / 30);
    }

    [Fact]
    public void FindMatchingTimeStep_Should_AcceptTwoStepsOfDrift_And_RejectThree()
    {
        var issuedAt = DateTimeOffset.FromUnixTimeSeconds(1111111109);
        var code = TotpCodes.GenerateCode(RfcKey, issuedAt);

        TotpCodes.FindMatchingTimeStep(RfcKey, code, issuedAt.AddSeconds(60)).ShouldBe(1111111109L / 30);
        TotpCodes.FindMatchingTimeStep(RfcKey, code, issuedAt.AddSeconds(120)).ShouldBeNull();
    }

    [Theory]
    [InlineData("")]
    [InlineData("abcdef")]
    [InlineData("-12345")]
    public void FindMatchingTimeStep_Should_ReturnNull_When_CodeIsNotNumeric(string code)
    {
        TotpCodes.FindMatchingTimeStep(RfcKey, code, DateTimeOffset.FromUnixTimeSeconds(59)).ShouldBeNull();
    }
}
