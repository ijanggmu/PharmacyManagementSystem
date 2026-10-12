using FSH.Modules.Accounting.Contracts.v1.PostingLock;
using FSH.Modules.Accounting.Features.v1.PostingLock.SetPostingLock;
using FSH.Modules.Accounting.Services;

namespace Accounting.Tests.Features.PostingLock;

/// <summary>The posting lock can be cleared or set to a day before today (Nepal time) — never today or later,
/// which would leave no open day for system postings.</summary>
public sealed class SetPostingLockCommandValidatorTests
{
    private static readonly DateOnly Today = NepalDate.FromUtc(DateTime.UtcNow);
    private readonly SetPostingLockCommandValidator _validator = new();

    [Fact]
    public void Should_Accept_Clearing_And_APastDay()
    {
        _validator.Validate(new SetPostingLockCommand(null)).IsValid.ShouldBeTrue();
        _validator.Validate(new SetPostingLockCommand(Today.AddDays(-1))).IsValid.ShouldBeTrue();
    }

    [Fact]
    public void Should_Reject_Today_And_FutureDays()
    {
        _validator.Validate(new SetPostingLockCommand(Today)).IsValid.ShouldBeFalse();
        _validator.Validate(new SetPostingLockCommand(Today.AddDays(5))).IsValid.ShouldBeFalse();
    }
}
