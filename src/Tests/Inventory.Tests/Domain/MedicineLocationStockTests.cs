using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Domain;

namespace Inventory.Tests.Domain;

public sealed class MedicineLocationStockTests
{
    #region Credit

    [Fact]
    public void Credit_Should_IncreaseQuantityOnHand()
    {
        var stock = MedicineLocationStock.CreateEmpty(Guid.CreateVersion7(), Guid.CreateVersion7());

        stock.Credit(40m);

        stock.QuantityOnHand.ShouldBe(40m);
    }

    [Fact]
    public void Credit_Should_Throw_When_QuantityNotPositive()
    {
        var stock = MedicineLocationStock.CreateEmpty(Guid.CreateVersion7(), Guid.CreateVersion7());

        Should.Throw<ArgumentOutOfRangeException>(() => stock.Credit(0m));
    }

    #endregion

    #region Debit

    [Fact]
    public void Debit_Should_ReduceQuantityOnHand_When_Sufficient()
    {
        var stock = MedicineLocationStock.CreateEmpty(Guid.CreateVersion7(), Guid.CreateVersion7());
        stock.Credit(100m);

        stock.Debit(30m);

        stock.QuantityOnHand.ShouldBe(70m);
    }

    [Fact]
    public void Debit_Should_Throw_When_InsufficientStock()
    {
        var stock = MedicineLocationStock.CreateEmpty(Guid.CreateVersion7(), Guid.CreateVersion7());
        stock.Credit(10m);

        Should.Throw<CustomException>(() => stock.Debit(11m));
    }

    #endregion
}
