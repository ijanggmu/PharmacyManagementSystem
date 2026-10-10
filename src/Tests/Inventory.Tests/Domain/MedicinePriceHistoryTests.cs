using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Domain;

namespace Inventory.Tests.Domain;

public sealed class MedicinePriceHistoryTests
{
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.UtcNow);

    #region CreateActive / CreateScheduled

    [Fact]
    public void CreateActive_Should_SetStatusActive()
    {
        var history = MedicinePriceHistory.CreateActive(Guid.CreateVersion7(), 100m, 60m, Today, "price hike");

        history.Status.ShouldBe(MedicinePriceHistoryStatus.Active);
        history.UnitPrice.ShouldBe(100m);
        history.CostPrice.ShouldBe(60m);
        history.EffectiveFrom.ShouldBe(Today);
        history.EffectiveTo.ShouldBeNull();
        history.Reason.ShouldBe("price hike");
    }

    [Fact]
    public void CreateScheduled_Should_SetStatusScheduled()
    {
        var future = Today.AddDays(7);
        var history = MedicinePriceHistory.CreateScheduled(Guid.CreateVersion7(), 120m, null, future, null);

        history.Status.ShouldBe(MedicinePriceHistoryStatus.Scheduled);
        history.EffectiveFrom.ShouldBe(future);
    }

    [Fact]
    public void CreateActive_Should_Throw_When_UnitPriceNegative()
    {
        Should.Throw<ArgumentOutOfRangeException>(
            () => MedicinePriceHistory.CreateActive(Guid.CreateVersion7(), -1m, null, Today, null));
    }

    [Fact]
    public void CreateActive_Should_Throw_When_CostPriceNegative()
    {
        Should.Throw<ArgumentOutOfRangeException>(
            () => MedicinePriceHistory.CreateActive(Guid.CreateVersion7(), 10m, -1m, Today, null));
    }

    #endregion

    #region Supersede / Cancel

    [Fact]
    public void Supersede_Should_CloseActiveRow()
    {
        var history = MedicinePriceHistory.CreateActive(Guid.CreateVersion7(), 100m, null, Today.AddDays(-30), null);

        history.Supersede(Today);

        history.Status.ShouldBe(MedicinePriceHistoryStatus.Superseded);
        history.EffectiveTo.ShouldBe(Today);
    }

    [Fact]
    public void Supersede_Should_Throw_When_NotActive()
    {
        var history = MedicinePriceHistory.CreateScheduled(Guid.CreateVersion7(), 100m, null, Today.AddDays(1), null);

        Should.Throw<CustomException>(() => history.Supersede(Today));
    }

    [Fact]
    public void Cancel_Should_SetStatusCancelled_When_Scheduled()
    {
        var history = MedicinePriceHistory.CreateScheduled(Guid.CreateVersion7(), 100m, null, Today.AddDays(1), null);

        history.Cancel();

        history.Status.ShouldBe(MedicinePriceHistoryStatus.Cancelled);
    }

    [Fact]
    public void Cancel_Should_Throw_When_NotScheduled()
    {
        var history = MedicinePriceHistory.CreateActive(Guid.CreateVersion7(), 100m, null, Today, null);

        Should.Throw<CustomException>(() => history.Cancel());
    }

    #endregion
}
