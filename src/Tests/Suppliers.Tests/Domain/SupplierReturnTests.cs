using FSH.Modules.Suppliers.Domain;

namespace Suppliers.Tests.Domain;

public sealed class SupplierReturnTests
{
    [Fact]
    public void Create_Should_StampFieldsIncludingBranchId()
    {
        var supplierId = Guid.CreateVersion7();
        var branchId = Guid.CreateVersion7();
        var returnDateUtc = DateTime.UtcNow;

        var supplierReturn = SupplierReturn.Create(supplierId, returnDateUtc, "  damaged goods  ", branchId);

        supplierReturn.SupplierId.ShouldBe(supplierId);
        supplierReturn.ReturnDateUtc.ShouldBe(returnDateUtc);
        supplierReturn.Notes.ShouldBe("damaged goods");
        supplierReturn.BranchId.ShouldBe(branchId);
        supplierReturn.Id.ShouldNotBe(Guid.Empty);
    }

    [Fact]
    public void Create_Should_PersistNullBranchId_When_NotProvided()
    {
        var supplierReturn = SupplierReturn.Create(Guid.CreateVersion7(), DateTime.UtcNow, null);

        supplierReturn.BranchId.ShouldBeNull();
    }

    [Fact]
    public void AddItem_Should_AppendItemAndComputeTotalCost()
    {
        var supplierReturn = SupplierReturn.Create(Guid.CreateVersion7(), DateTime.UtcNow, null);
        var medicineId = Guid.CreateVersion7();

        supplierReturn.AddItem(medicineId, quantity: 5m, unitCost: 10m, returnReason: "Expired", notes: null);

        supplierReturn.Items.Count.ShouldBe(1);
        supplierReturn.TotalCost.ShouldBe(50m);
    }
}
