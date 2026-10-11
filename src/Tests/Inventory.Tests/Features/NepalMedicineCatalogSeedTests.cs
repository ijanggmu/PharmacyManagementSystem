using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using Microsoft.EntityFrameworkCore;

namespace Inventory.Tests.Features;

public sealed class NepalMedicineCatalogSeedTests
{
    private static readonly string[] AllowedForms = ["tablet", "capsule", "syrup", "injection", "cream", "drops"];

    [Fact]
    public void Load_Should_ReturnUniqueBrandNames_With_FormsTheMedicineFormAccepts()
    {
        var rows = NepalMedicineCatalogSeed.Load();

        rows.Count.ShouldBeGreaterThan(2000);
        rows.ShouldAllBe(r => !string.IsNullOrWhiteSpace(r.BrandName));
        rows.Select(r => r.BrandName.ToUpperInvariant()).Distinct().Count().ShouldBe(rows.Count);
        rows.Where(r => r.Form != null).ShouldAllBe(r => AllowedForms.Contains(r.Form));
    }

    [Fact]
    public async Task SeedAsync_Should_InsertAll_Then_BeIdempotent()
    {
        using var db = InventoryDbContextFactory.Create();
        int expected = NepalMedicineCatalogSeed.Load().Count;

        int first = await NepalMedicineCatalogSeed.SeedAsync(db);
        int second = await NepalMedicineCatalogSeed.SeedAsync(db);

        first.ShouldBe(expected);
        second.ShouldBe(0);
        (await db.NepalMedicineCatalogEntries.CountAsync()).ShouldBe(expected);
    }

    [Fact]
    public async Task SeedAsync_Should_SkipBrandsAlreadyInDirectory_CaseInsensitive()
    {
        using var db = InventoryDbContextFactory.Create();
        string brand = NepalMedicineCatalogSeed.Load()[0].BrandName;
        db.NepalMedicineCatalogEntries.Add(NepalMedicineCatalogEntry.Create(new string(brand.Select(char.ToLowerInvariant).ToArray()), "Curated generic"));
        await db.SaveChangesAsync();

        await NepalMedicineCatalogSeed.SeedAsync(db);

        var matches = (await db.NepalMedicineCatalogEntries.ToListAsync())
            .Where(e => string.Equals(e.BrandName, brand, StringComparison.OrdinalIgnoreCase))
            .ToList();
        matches.Count.ShouldBe(1);
        matches[0].GenericName.ShouldBe("Curated generic");
    }
}
