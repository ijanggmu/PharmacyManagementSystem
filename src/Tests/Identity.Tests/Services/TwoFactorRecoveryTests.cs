using FSH.Modules.Identity.Contracts.v1.TwoFactor;
using FSH.Modules.Identity.Contracts.v1.Users.AdminResetTwoFactor;
using FSH.Modules.Identity.Features.v1.TwoFactor;
using FSH.Modules.Identity.Features.v1.TwoFactor.RecoveryCodes;
using FSH.Modules.Identity.Features.v1.Users.AdminResetTwoFactor;

namespace Identity.Tests.Services;

/// <summary>
/// Tests for the two-factor recovery helpers and the validators of the recovery/reset commands.
/// </summary>
public sealed class TwoFactorRecoveryTests
{
    [Theory]
    [InlineData("ABCDE-FGHJK", "ABCDE-FGHJK")]
    [InlineData("abcde-fghjk", "ABCDE-FGHJK")]
    [InlineData("  ABCDE-FGHJK  ", "ABCDE-FGHJK")]
    [InlineData("ABCDEFGHJK", "ABCDE-FGHJK")]
    [InlineData("abcde fghjk", "ABCDE-FGHJK")]
    [InlineData("ab cde-fg hjk", "ABCDE-FGHJK")]
    public void NormalizeRecoveryCode_Should_Produce_IdentityFormat(string input, string expected)
    {
        TwoFactorDefaults.NormalizeRecoveryCode(input).ShouldBe(expected);
    }

    [Theory]
    [InlineData("ABC", "ABC")]
    [InlineData("ABCDEFGHJKL", "ABCDEFGHJKL")]
    public void NormalizeRecoveryCode_Should_Not_Insert_Hyphen_When_Length_Is_Not_Ten(string input, string expected)
    {
        TwoFactorDefaults.NormalizeRecoveryCode(input).ShouldBe(expected);
    }

    [Fact]
    public void Issuer_Should_Be_PharmaCare()
    {
        TwoFactorDefaults.Issuer.ShouldBe("PharmaCare");
    }

    [Fact]
    public void RegenerateRecoveryCodesValidator_Should_Fail_When_Password_Empty()
    {
        var result = new RegenerateRecoveryCodesCommandValidator().Validate(new RegenerateRecoveryCodesCommand(string.Empty));
        result.IsValid.ShouldBeFalse();
    }

    [Fact]
    public void RegenerateRecoveryCodesValidator_Should_Pass_When_Password_Present()
    {
        var result = new RegenerateRecoveryCodesCommandValidator().Validate(new RegenerateRecoveryCodesCommand("Password123!"));
        result.IsValid.ShouldBeTrue();
    }

    [Fact]
    public void AdminResetTwoFactorValidator_Should_Fail_When_UserId_Empty()
    {
        var result = new AdminResetTwoFactorCommandValidator().Validate(new AdminResetTwoFactorCommand(string.Empty));
        result.IsValid.ShouldBeFalse();
    }

    [Fact]
    public void AdminResetTwoFactorValidator_Should_Pass_When_UserId_Present()
    {
        var result = new AdminResetTwoFactorCommandValidator().Validate(new AdminResetTwoFactorCommand(Guid.NewGuid().ToString()));
        result.IsValid.ShouldBeTrue();
    }
}
