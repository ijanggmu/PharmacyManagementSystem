using FSH.Modules.Multitenancy.Contracts.v1.CreateBranch;
using FSH.Modules.Multitenancy.Features.v1.CreateBranch;

namespace Multitenancy.Tests.Features.Branches;

public sealed class CreateBranchCommandValidatorTests
{
    private readonly CreateBranchCommandValidator _sut = new();

    [Theory]
    [InlineData("")]
    [InlineData(" ")]
    public void Validate_Should_Fail_When_NameIsEmpty(string name)
    {
        var result = _sut.Validate(new CreateBranchCommand(name, "MAIN"));
        result.IsValid.ShouldBeFalse();
        result.Errors.ShouldContain(e => e.PropertyName == nameof(CreateBranchCommand.Name));
    }

    [Theory]
    [InlineData("")]
    [InlineData(" ")]
    public void Validate_Should_Fail_When_CodeIsEmpty(string code)
    {
        var result = _sut.Validate(new CreateBranchCommand("Main Branch", code));
        result.IsValid.ShouldBeFalse();
        result.Errors.ShouldContain(e => e.PropertyName == nameof(CreateBranchCommand.Code));
    }

    [Fact]
    public void Validate_Should_Pass_When_NameAndCodeProvided()
    {
        var result = _sut.Validate(new CreateBranchCommand("Main Branch", "MAIN"));
        result.IsValid.ShouldBeTrue();
    }
}
