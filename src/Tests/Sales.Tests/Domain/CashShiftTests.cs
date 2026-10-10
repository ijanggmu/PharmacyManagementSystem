using FSH.Framework.Core.Exceptions;
using FSH.Modules.Sales.Domain;

namespace Sales.Tests.Domain;

public sealed class CashShiftTests
{
    #region Open

    [Fact]
    public void Open_Should_TrimOpenedBy_And_SetStatusOpen()
    {
        var shift = CashShift.Open(Guid.CreateVersion7(), "  cashier1  ", 100m, "  morning shift  ");

        shift.OpenedBy.ShouldBe("cashier1");
        shift.OpeningFloat.ShouldBe(100m);
        shift.Status.ShouldBe(CashShiftStatus.Open);
    }

    [Fact]
    public void Open_Should_Throw_When_OpeningFloatNegative()
    {
        Should.Throw<ArgumentOutOfRangeException>(() => CashShift.Open(Guid.CreateVersion7(), "cashier1", -1m, null));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Open_Should_Throw_When_OpenedByBlank(string openedBy)
    {
        Should.Throw<ArgumentException>(() => CashShift.Open(Guid.CreateVersion7(), openedBy, 0m, null));
    }

    #endregion

    #region Close

    [Fact]
    public void Close_Should_SetStatusClosed_When_Open()
    {
        var shift = CashShift.Open(Guid.CreateVersion7(), "cashier1", 100m, null);

        shift.Close("manager1", 350m);

        shift.Status.ShouldBe(CashShiftStatus.Closed);
        shift.ClosedBy.ShouldBe("manager1");
        shift.ClosingCashCounted.ShouldBe(350m);
        shift.ClosedAtUtc.ShouldNotBeNull();
    }

    [Fact]
    public void Close_Should_Throw_When_AlreadyClosed()
    {
        var shift = CashShift.Open(Guid.CreateVersion7(), "cashier1", 100m, null);
        shift.Close("manager1", 350m);

        Should.Throw<CustomException>(() => shift.Close("manager1", 400m));
    }

    [Fact]
    public void Close_Should_Throw_When_ClosingCashCountedNegative()
    {
        var shift = CashShift.Open(Guid.CreateVersion7(), "cashier1", 100m, null);

        Should.Throw<ArgumentOutOfRangeException>(() => shift.Close("manager1", -1m));
    }

    #endregion
}
