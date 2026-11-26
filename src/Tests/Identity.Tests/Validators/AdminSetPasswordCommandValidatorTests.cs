using FSH.Modules.Identity.Contracts.v1.Users.AdminSetPassword;
using FSH.Modules.Identity.Features.v1.Users.AdminSetPassword;

namespace Identity.Tests.Validators;

public sealed class AdminSetPasswordCommandValidatorTests
{
    private readonly AdminSetPasswordCommandValidator _sut = new();
    private const string UserId = "6f1c1f7e-0d0e-4a7a-9c1b-2b8f7c1d3e4f";

    [Fact]
    public void Should_Pass_ForStrongMatchingPassword()
    {
        _sut.Validate(new AdminSetPasswordCommand(UserId, "Str0ngPassw0rd", "Str0ngPassw0rd")).IsValid.ShouldBeTrue();
    }

    [Theory]
    [InlineData("Sh0rtA")]
    [InlineData("alllowercase123")]
    [InlineData("ALLUPPERCASE123")]
    [InlineData("NoDigitsHereAtAll")]
    public void Should_Fail_WhenPasswordBreaksPolicy(string password)
    {
        var result = _sut.Validate(new AdminSetPasswordCommand(UserId, password, password));
        result.Errors.ShouldContain(e => e.PropertyName == nameof(AdminSetPasswordCommand.NewPassword));
    }

    [Fact]
    public void Should_Fail_WhenConfirmationDiffers()
    {
        var result = _sut.Validate(new AdminSetPasswordCommand(UserId, "Str0ngPassw0rd", "Str0ngPassw0rdX"));
        result.Errors.ShouldContain(e => e.PropertyName == nameof(AdminSetPasswordCommand.ConfirmNewPassword));
    }

    [Fact]
    public void Should_Fail_WhenUserIdMissing()
    {
        var result = _sut.Validate(new AdminSetPasswordCommand("", "Str0ngPassw0rd", "Str0ngPassw0rd"));
        result.Errors.ShouldContain(e => e.PropertyName == nameof(AdminSetPasswordCommand.UserId));
    }
}
