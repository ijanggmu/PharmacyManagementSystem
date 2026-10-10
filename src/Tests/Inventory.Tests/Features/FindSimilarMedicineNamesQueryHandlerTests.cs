using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Features.v1.Medicines.FindSimilarMedicineNames;

namespace Inventory.Tests.Features;

public sealed class FindSimilarMedicineNamesQueryHandlerTests
{
    [Fact]
    public async Task Handle_Should_ReturnEmpty_When_NameShorterThanThree()
    {
        using var db = InventoryDbContextFactory.Create();
        var handler = new FindSimilarMedicineNamesQueryHandler(db);

        var result = await handler.Handle(new FindSimilarMedicineNamesQuery("Am"), CancellationToken.None);

        result.ShouldBeEmpty();
    }

    [Fact]
    public async Task Handle_Should_FindNearDuplicate_Within_Threshold()
    {
        using var db = InventoryDbContextFactory.Create();
        var existing = Medicine.Create("Amlodipine", null, null, 0m);
        db.Medicines.Add(existing);
        await db.SaveChangesAsync();

        var handler = new FindSimilarMedicineNamesQueryHandler(db);

        // "Amlodipin" is edit distance 1 from "Amlodipine" (missing trailing 'e').
        var result = await handler.Handle(new FindSimilarMedicineNamesQuery("Amlodipin"), CancellationToken.None);

        result.Count.ShouldBe(1);
        result[0].Id.ShouldBe(existing.Id);
        result[0].Distance.ShouldBe(1);
    }

    [Fact]
    public async Task Handle_Should_ExcludeExactMatch()
    {
        using var db = InventoryDbContextFactory.Create();
        db.Medicines.Add(Medicine.Create("Paracetamol", null, null, 0m));
        await db.SaveChangesAsync();

        var handler = new FindSimilarMedicineNamesQueryHandler(db);
        var result = await handler.Handle(new FindSimilarMedicineNamesQuery("Paracetamol"), CancellationToken.None);

        result.ShouldBeEmpty();
    }

    [Fact]
    public async Task Handle_Should_ExcludeGivenId()
    {
        using var db = InventoryDbContextFactory.Create();
        var existing = Medicine.Create("Amlodipine", null, null, 0m);
        db.Medicines.Add(existing);
        await db.SaveChangesAsync();

        var handler = new FindSimilarMedicineNamesQueryHandler(db);
        var result = await handler.Handle(
            new FindSimilarMedicineNamesQuery("Amlodipin", existing.Id), CancellationToken.None);

        result.ShouldBeEmpty();
    }

    [Fact]
    public async Task Handle_Should_NotMatch_When_DistanceExceedsThreshold_ForShortName()
    {
        using var db = InventoryDbContextFactory.Create();
        // "Panol" (5 chars) vs "Panadol" (7 chars): distance 2, threshold for a <=5-char needle is 1.
        db.Medicines.Add(Medicine.Create("Panadol", null, null, 0m));
        await db.SaveChangesAsync();

        var handler = new FindSimilarMedicineNamesQueryHandler(db);
        var result = await handler.Handle(new FindSimilarMedicineNamesQuery("Panol"), CancellationToken.None);

        result.ShouldBeEmpty();
    }
}
