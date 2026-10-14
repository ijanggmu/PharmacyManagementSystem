using System.Net;
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

    [Fact]
    public void Create_Should_Authorize_PrescribedQuantity_Per_Fill()
    {
        var item = CreateItem(prescribedQuantity: 21m, refillsAllowed: 1);

        item.FillsAllowed.ShouldBe(2);
        item.TotalAuthorizedQuantity.ShouldBe(42m);
        item.RemainingQuantity.ShouldBe(42m);
        item.RemainingInCurrentFill.ShouldBe(21m);
        item.FillsUsed.ShouldBe(0);
    }

    #endregion

    #region RecordDispense

    [Fact]
    public void RecordDispense_Should_ReduceRemainingQuantity_And_Not_UseAFill_When_Partial()
    {
        var item = CreateItem(prescribedQuantity: 30m, refillsAllowed: 1);

        item.RecordDispense(10m);

        item.DispensedQuantity.ShouldBe(10m);
        item.RemainingQuantity.ShouldBe(50m);
        item.RemainingInCurrentFill.ShouldBe(20m);
        item.FillsUsed.ShouldBe(0);
        item.RefillsUsed.ShouldBe(0);
    }

    [Fact]
    public void RecordDispense_Should_Allow_The_Refill_When_The_First_Fill_Was_Dispensed_In_Full()
    {
        // AMOX 21 with 1 refill: the first fill and the refill are each 21.
        var item = CreateItem(prescribedQuantity: 21m, refillsAllowed: 1);

        item.RecordDispense(21m);
        item.FillsUsed.ShouldBe(1);
        item.RemainingInCurrentFill.ShouldBe(21m);

        item.RecordDispense(21m);

        item.DispensedQuantity.ShouldBe(42m);
        item.FillsUsed.ShouldBe(2);
        item.RefillsUsed.ShouldBe(2);
        item.RemainingQuantity.ShouldBe(0m);
        Should.Throw<CustomException>(() => item.RecordDispense(1m)).StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    [Fact]
    public void RecordDispense_Should_Allow_The_Balance_Of_A_Partial_Fill()
    {
        // MORPH 10, no refills: 6 now, the remaining 4 later.
        var item = CreateItem(prescribedQuantity: 10m, refillsAllowed: 0);

        item.RecordDispense(6m);
        item.FillsUsed.ShouldBe(0);

        item.RecordDispense(4m);

        item.DispensedQuantity.ShouldBe(10m);
        item.FillsUsed.ShouldBe(1);
        item.RemainingQuantity.ShouldBe(0m);
        Should.Throw<CustomException>(() => item.RecordDispense(1m));
    }

    [Fact]
    public void RecordDispense_Should_Throw_When_ExceedsTheCurrentFill()
    {
        // 10 per fill with 5 refills: a single dispense can't hand out a refill early.
        var item = CreateItem(prescribedQuantity: 10m, refillsAllowed: 5);

        Should.Throw<CustomException>(() => item.RecordDispense(11m)).StatusCode.ShouldBe(HttpStatusCode.Conflict);

        item.RecordDispense(7m);
        Should.Throw<CustomException>(() => item.RecordDispense(4m));
        item.RecordDispense(3m);
        item.FillsUsed.ShouldBe(1);
    }

    [Fact]
    public void RecordDispense_Should_Throw_When_NoRefillsRemaining()
    {
        var item = CreateItem(prescribedQuantity: 30m, refillsAllowed: 0);
        item.RecordDispense(30m); // the only fill, dispensed in full

        Should.Throw<CustomException>(() => item.RecordDispense(5m));
    }

    [Fact]
    public void RecordDispense_Should_Throw_When_QuantityNotPositive()
    {
        var item = CreateItem();

        Should.Throw<CustomException>(() => item.RecordDispense(0m));
    }

    #endregion

    #region ReverseDispense

    [Fact]
    public void ReverseDispense_Should_Give_A_Fill_Back_Only_When_Dropping_Below_A_Completed_Fill()
    {
        var item = CreateItem(prescribedQuantity: 10m, refillsAllowed: 1);
        item.RecordDispense(10m);
        item.RecordDispense(4m);
        item.FillsUsed.ShouldBe(1);

        item.ReverseDispense(4m).ShouldBeFalse(); // back to exactly one completed fill
        item.FillsUsed.ShouldBe(1);

        item.ReverseDispense(3m).ShouldBeTrue(); // 7 dispensed: the first fill is partial again
        item.FillsUsed.ShouldBe(0);
        item.RefillsUsed.ShouldBe(0);
        item.RemainingInCurrentFill.ShouldBe(3m);
    }

    #endregion
}
