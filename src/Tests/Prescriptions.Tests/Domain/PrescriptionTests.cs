using FSH.Framework.Core.Exceptions;
using FSH.Modules.Prescriptions.Domain;

namespace Prescriptions.Tests.Domain;

public sealed class PrescriptionTests
{
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.UtcNow);

    #region Create

    [Fact]
    public void Create_Should_TrimDoctorName_When_Valid()
    {
        var prescription = Prescription.Create(Guid.CreateVersion7(), "  Dr. Smith  ", Today, Today.AddDays(30));

        prescription.DoctorName.ShouldBe("Dr. Smith");
        prescription.Status.ShouldBe(PrescriptionStatus.Active);
    }

    [Fact]
    public void Create_Should_Throw_When_ExpiryBeforePrescriptionDate()
    {
        Should.Throw<CustomException>(() => Prescription.Create(Guid.CreateVersion7(), "Dr. Smith", Today, Today.AddDays(-1)));
    }

    #endregion

    #region AddItem / FindItem

    [Fact]
    public void FindItem_Should_ReturnItem_When_MedicineMatches()
    {
        var prescription = Prescription.Create(Guid.CreateVersion7(), "Dr. Smith", Today, Today.AddDays(30));
        var medicineId = Guid.CreateVersion7();
        prescription.AddItem(medicineId, 30m, refillsAllowed: 2);

        var found = prescription.FindItem(medicineId);

        found.ShouldNotBeNull();
        found!.PrescribedQuantity.ShouldBe(30m);
        found.RefillsAllowed.ShouldBe(2);
    }

    [Fact]
    public void FindItem_Should_ReturnNull_When_NoMatch()
    {
        var prescription = Prescription.Create(Guid.CreateVersion7(), "Dr. Smith", Today, Today.AddDays(30));

        prescription.FindItem(Guid.CreateVersion7()).ShouldBeNull();
    }

    #endregion

    #region Cancel

    [Fact]
    public void Cancel_Should_Succeed_When_Active()
    {
        var prescription = Prescription.Create(Guid.CreateVersion7(), "Dr. Smith", Today, Today.AddDays(30));

        prescription.Cancel("no longer needed");

        prescription.Status.ShouldBe(PrescriptionStatus.Cancelled);
    }

    [Fact]
    public void Cancel_Should_Throw_When_AlreadyCancelled()
    {
        var prescription = Prescription.Create(Guid.CreateVersion7(), "Dr. Smith", Today, Today.AddDays(30));
        prescription.Cancel("first");

        Should.Throw<CustomException>(() => prescription.Cancel("second"));
    }

    #endregion

    #region IsValidAsOf

    [Fact]
    public void IsValidAsOf_Should_ReturnFalse_When_Expired()
    {
        var prescription = Prescription.Create(Guid.CreateVersion7(), "Dr. Smith", Today.AddDays(-60), Today.AddDays(-1));

        prescription.IsValidAsOf(Today).ShouldBeFalse();
    }

    [Fact]
    public void IsValidAsOf_Should_ReturnFalse_When_Cancelled()
    {
        var prescription = Prescription.Create(Guid.CreateVersion7(), "Dr. Smith", Today, Today.AddDays(30));
        prescription.Cancel("stopped");

        prescription.IsValidAsOf(Today).ShouldBeFalse();
    }

    [Fact]
    public void IsValidAsOf_Should_ReturnTrue_When_ActiveAndNotExpired()
    {
        var prescription = Prescription.Create(Guid.CreateVersion7(), "Dr. Smith", Today, Today.AddDays(30));

        prescription.IsValidAsOf(Today).ShouldBeTrue();
    }

    #endregion
}
