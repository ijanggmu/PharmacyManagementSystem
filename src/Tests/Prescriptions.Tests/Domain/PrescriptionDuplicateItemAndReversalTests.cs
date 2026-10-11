using FluentValidation.TestHelper;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;
using FSH.Modules.Prescriptions.Domain;
using FSH.Modules.Prescriptions.Features.v1.Prescriptions.CreatePrescription;

namespace Prescriptions.Tests.Domain;

public sealed class PrescriptionDuplicateItemAndReversalTests
{
    private static readonly DateOnly Today = new(2026, 6, 15);

    [Fact]
    public void AddItem_Should_Reject_A_Second_Line_For_The_Same_Medicine()
    {
        var medicineId = Guid.CreateVersion7();
        var prescription = Prescription.Create(Guid.CreateVersion7(), "Dr. Test", Today, Today.AddDays(30));
        prescription.AddItem(medicineId, 10m, 0);

        Should.Throw<CustomException>(() => prescription.AddItem(medicineId, 5m, 0));
        prescription.Items.Count.ShouldBe(1);
    }

    [Fact]
    public void CreateValidator_Should_Reject_Duplicate_Medicines()
    {
        var medicineId = Guid.CreateVersion7();
        var command = new CreatePrescriptionCommand(
            Guid.CreateVersion7(), "Dr. Test", Today, Today.AddDays(30),
            [new PrescriptionItemInput(medicineId, 10m, 0), new PrescriptionItemInput(medicineId, 5m, 0)]);

        new CreatePrescriptionCommandValidator().TestValidate(command).ShouldHaveValidationErrorFor(x => x.Items);
    }

    [Fact]
    public void RecordSaleDispense_Then_ReverseDispense_Should_Restore_Quantity_And_Fill()
    {
        var medicineId = Guid.CreateVersion7();
        var prescription = Prescription.Create(Guid.CreateVersion7(), "Dr. Test", Today, Today.AddDays(30));
        prescription.AddItem(medicineId, 10m, 0);
        var saleId = Guid.CreateVersion7();

        var refill = prescription.RecordSaleDispense(medicineId, 4m, saleId, DateTime.UtcNow, null);
        refill.SaleId.ShouldBe(saleId);
        var item = prescription.FindItem(medicineId)!;
        item.RefillsUsed.ShouldBe(1);

        item.ReverseDispense(4m, restoreFill: true);
        item.DispensedQuantity.ShouldBe(0m);
        item.RefillsUsed.ShouldBe(0);
        Should.Throw<CustomException>(() => item.ReverseDispense(1m, restoreFill: false));
    }
}
