using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Features.v1.Medicines.GetMedicineNames;

namespace Inventory.Tests.Features;

public sealed class GetMedicineNamesQueryHandlerTests
{
    [Fact]
    public async Task Handle_Should_Return_Names_For_Known_Ids_Only()
    {
        using var db = InventoryDbContextFactory.Create();
        var paracetamol = Medicine.Create("Paracetamol", null, null, 0m);
        var cetirizine = Medicine.Create("Cetirizine", null, null, 0m);
        db.Medicines.AddRange(paracetamol, cetirizine);
        await db.SaveChangesAsync();

        var result = await new GetMedicineNamesQueryHandler(db).Handle(
            new GetMedicineNamesQuery([paracetamol.Id, Guid.CreateVersion7(), paracetamol.Id]), CancellationToken.None);

        result.Count.ShouldBe(1);
        result[paracetamol.Id].ShouldBe("Paracetamol");
    }

    [Fact]
    public async Task Handle_Should_Return_Empty_For_No_Ids()
    {
        using var db = InventoryDbContextFactory.Create();

        var result = await new GetMedicineNamesQueryHandler(db).Handle(new GetMedicineNamesQuery([]), CancellationToken.None);

        result.ShouldBeEmpty();
    }
}
