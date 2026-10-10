using FSH.Framework.Core.Exceptions;
using FSH.Modules.Onboarding.Domain;

namespace Onboarding.Tests.Domain;

public sealed class OnboardingStatusTests
{
    #region CreatePending

    [Fact]
    public void CreatePending_Should_StartNotCompleted()
    {
        var status = OnboardingStatus.CreatePending();

        status.IsCompleted.ShouldBeFalse();
        status.CompletedAtUtc.ShouldBeNull();
    }

    #endregion

    #region Complete

    [Fact]
    public void Complete_Should_SetCompletedFields_When_Pending()
    {
        var status = OnboardingStatus.CreatePending();
        var voucherId = Guid.CreateVersion7();

        status.Complete(voucherId, "  admin1  ");

        status.IsCompleted.ShouldBeTrue();
        status.OpeningBalanceVoucherId.ShouldBe(voucherId);
        status.CompletedBy.ShouldBe("admin1");
        status.CompletedAtUtc.ShouldNotBeNull();
    }

    [Fact]
    public void Complete_Should_Throw_When_AlreadyCompleted()
    {
        var status = OnboardingStatus.CreatePending();
        status.Complete(Guid.CreateVersion7(), "admin1");

        Should.Throw<CustomException>(() => status.Complete(Guid.CreateVersion7(), "admin1"));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Complete_Should_Throw_When_CompletedByBlank(string completedBy)
    {
        var status = OnboardingStatus.CreatePending();

        Should.Throw<ArgumentException>(() => status.Complete(Guid.CreateVersion7(), completedBy));
    }

    #endregion
}
