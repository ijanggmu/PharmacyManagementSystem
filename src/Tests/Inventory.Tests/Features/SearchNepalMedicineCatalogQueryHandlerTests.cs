using FSH.Modules.Inventory.Contracts.v1.MedicineCatalog;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Features.v1.MedicineCatalog.SearchNepalMedicineCatalog;

namespace Inventory.Tests.Features;

public sealed class SearchNepalMedicineCatalogQueryHandlerTests
{
    [Fact]
    public async Task Handle_Should_ReturnAll_When_QueryTooShort()
    {
        using var db = InventoryDbContextFactory.Create();
        db.NepalMedicineCatalogEntries.Add(NepalMedicineCatalogEntry.Create("Napa", "Paracetamol"));
        db.NepalMedicineCatalogEntries.Add(NepalMedicineCatalogEntry.Create("Amoxin", "Amoxicillin"));
        await db.SaveChangesAsync();

        var handler = new SearchNepalMedicineCatalogQueryHandler(db);
        var result = await handler.Handle(new SearchNepalMedicineCatalogQuery("n", 10), CancellationToken.None);

        result.Count.ShouldBe(2);
    }

    // Note: the brand/generic-name ILIKE filter (EF.Functions.ILike) only translates against the
    // real Npgsql provider, not EF Core's InMemory provider used here — it is covered by
    // Integration.Tests (Testcontainers/real Postgres) instead, matching how the rest of this
    // codebase's other ILike-based search handlers are tested (see e.g. AuditPayloadFilterTests).

    [Fact]
    public async Task Handle_Should_ClampLimit_To_25()
    {
        using var db = InventoryDbContextFactory.Create();
        for (int i = 0; i < 30; i++)
        {
            db.NepalMedicineCatalogEntries.Add(NepalMedicineCatalogEntry.Create($"Brand{i:D2}"));
        }

        await db.SaveChangesAsync();

        var handler = new SearchNepalMedicineCatalogQueryHandler(db);
        var result = await handler.Handle(new SearchNepalMedicineCatalogQuery(null, 1000), CancellationToken.None);

        result.Count.ShouldBe(25);
    }
}
