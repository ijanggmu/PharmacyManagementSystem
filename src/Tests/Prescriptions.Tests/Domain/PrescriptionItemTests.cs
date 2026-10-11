using FSH.Framework.Core.Exceptions;
using FSH.Modules.Prescriptions.Domain;

namespace Prescriptions.Tests.Domain;

public sealed class PrescriptionItemTests
{
    private static PrescriptionItem CreateItem(decimal prescribedQuantity = 30m, int refillsAllowed = 1) =>
        PrescriptionItem.Create(Guid.CreateVersion7(), prescribedQuantity, refillsAllowed);

    #region Create

    [Fact]
    public void Create_Should_Throw_When_PrescribedQuantityNotPositive()
    {
        Should.Throw<CustomException>(() => PrescriptionItem.Create(Guid.CreateVersion7(), 0m, 0));
    }

    [Fact]
    public void Create_Should_Throw_When_RefillsAllowedNegative()
    {
        Should.Throw<CustomException>(() => PrescriptionItem.Create(Guid.CreateVersion7(), 10m, -1));
    }

    #endregion

    #region RecordDispense

    [Fact]
    public void RecordDispense_Should_ReduceRemainingQuantity_And_ConsumeARefillSlot()
    {
        var item = CreateItem(prescribedQuantity: 30m, refillsAllowed: 1);

        item.RecordDispense(10m);

        item.DispensedQuantity.ShouldBe(10m);
        item.RemainingQuantity.ShouldBe(20m);
        item.RefillsUsed.ShouldBe(1);
    }

    [Fact]
    public void RecordDispense_Should_Throw_When_ExceedsRemainingQuantity()
    {
        var item = CreateItem(prescribedQuantity: 10m, refillsAllowed: 5);

        Should.Throw<CustomException>(() => item.RecordDispense(11m));
    }

    [Fact]
    public void RecordDispense_Should_Throw_When_NoRefillsRemaining()
    {
        var item = CreateItem(prescribedQuantity: 30m, refillsAllowed: 0);
        item.RecordDispense(10m); // consumes the only allowed fill (RefillsAllowed + 1 = 1)

        Should.Throw<CustomException>(() => item.RecordDispense(5m));
    }

    [Fact]
    public void RecordDispense_Should_Throw_When_QuantityNotPositive()
    {
        var item = CreateItem();

        Should.Throw<CustomException>(() => item.RecordDispense(0m));
    }

    #endregion
}
