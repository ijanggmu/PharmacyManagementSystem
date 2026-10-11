using FSH.Modules.Multitenancy.Contracts.v1.SwitchBranch;
using FSH.Modules.Multitenancy.Features.v1.SwitchBranch;

namespace Multitenancy.Tests.Features.Branches;

public sealed class SwitchBranchCommandValidatorTests
{
    private readonly SwitchBranchCommandValidator _sut = new();

    [Fact]
    public void Validate_Should_Fail_When_BranchIdIsEmpty()
    {
        var result = _sut.Validate(new SwitchBranchCommand(Guid.Empty));
        result.IsValid.ShouldBeFalse();
        result.Errors.ShouldContain(e => e.PropertyName == nameof(SwitchBranchCommand.BranchId));
    }

    [Fact]
    public void Validate_Should_Pass_When_BranchIdProvided()
    {
        var result = _sut.Validate(new SwitchBranchCommand(Guid.NewGuid()));
        result.IsValid.ShouldBeTrue();
    }
}
