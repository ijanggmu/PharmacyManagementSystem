using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Features.v1.Medicines.GetMedicineStats;
using FSH.Modules.Inventory.Features.v1.Medicines.SearchMedicines;
using FSH.Modules.Inventory.Features.v1.Reports.GetReorderSuggestions;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using NSubstitute;

namespace Inventory.Tests.Features;

/// <summary>
/// Low-stock, reorder and the medicine list's stock filters count sellable stock only: expired or
/// recalled units on the shelf cannot be sold, so they must not make a medicine look stocked. The
/// list filters, sorts and pages in the database with an exact total.
/// </summary>
public sealed class SellableStockQueryTests : IDisposable
{
    private readonly InventoryDbContext _db = InventoryDbContextFactory.Create();
    private readonly Guid _branchId = Guid.CreateVersion7();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly DateOnly _today = NepalClock.Today();

    public SellableStockQueryTests()
    {
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns((Guid?)null);
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
    }

    private Medicine AddMedicine(string name, decimal reorderLevel, params (decimal Quantity, int ExpiryInDays, bool Recalled)[] lots)
    {
        var medicine = Medicine.Create(name, null, null, reorderLevel);
        _db.Medicines.Add(medicine);
        int n = 0;
        foreach (var (quantity, expiryInDays, recalled) in lots)
        {
            var lot = MedicineBatch.Create(medicine.Id, _branchId, $"{name}-{n++}", _today.AddDays(expiryInDays), quantity, 1m, 2m, null);
            if (recalled) lot.Recall("supplier notice", DateTime.UtcNow);
            _db.MedicineBatches.Add(lot);
        }

        _db.SaveChanges();
        return medicine;
    }

    private SearchMedicinesQueryHandler Search() => new(_db, TimeProvider.System, _currentBranch);

    [Fact]
    public async Task Search_Out_Of_Stock_Filter_Should_Include_Medicine_Holding_Only_Expired_And_Recalled_Stock()
    {
        var onlyBad = AddMedicine("Amoxicillin", 5m, (50m, -2, false), (30m, 200, true));
        AddMedicine("Paracetamol", 5m, (50m, 200, false));

        var result = await Search().Handle(new SearchMedicinesQuery(StockStatuses: ["out"]), CancellationToken.None);

        var row = result.Items.ShouldHaveSingleItem();
        row.Id.ShouldBe(onlyBad.Id);
        row.SellableQuantityOnHand.ShouldBe(0m);
        row.TotalQuantityOnHand.ShouldBe(80m);  // the physical figure is still reported
        result.TotalCount.ShouldBe(1);
    }

    [Fact]
    public async Task Search_BelowReorderLevel_Should_Use_Sellable_Stock()
    {
        var mostlyExpired = AddMedicine("Cetirizine", 10m, (100m, -1, false), (4m, 90, false));
        AddMedicine("Ibuprofen", 10m, (40m, 90, false));

        var result = await Search().Handle(new SearchMedicinesQuery(BelowReorderLevel: true), CancellationToken.None);

        result.Items.ShouldHaveSingleItem().Id.ShouldBe(mostlyExpired.Id);
    }

    [Fact]
    public async Task Search_Should_Page_Filtered_Results_With_Exact_Total_And_Quantity_Sort()
    {
        for (int i = 0; i < 7; i++)
        {
            AddMedicine($"Low{i}", 100m, (i + 1, 60, false));
        }
        AddMedicine("Plenty", 1m, (500m, 60, false));

        var page2 = await Search().Handle(
            new SearchMedicinesQuery(StockStatuses: ["low"], SortBy: "quantity", SortOrder: "desc", PageNumber: 2, PageSize: 3),
            CancellationToken.None);

        page2.TotalCount.ShouldBe(7);
        page2.TotalPages.ShouldBe(3);
        page2.Items.Select(m => m.SellableQuantityOnHand).ShouldBe([4m, 3m, 2m]);
    }

    [Fact]
    public async Task Search_Expired_Filter_Should_Use_Nearest_Expiry_Of_Stocked_Lots()
    {
        var expired = AddMedicine("Expired", 1m, (5m, -5, false), (5m, 100, false));
        AddMedicine("Fresh", 1m, (5m, 100, false));

        var result = await Search().Handle(new SearchMedicinesQuery(ExpiryStatuses: ["expired"]), CancellationToken.None);

        result.Items.ShouldHaveSingleItem().Id.ShouldBe(expired.Id);
    }

    [Fact]
    public async Task ReorderSuggestions_Should_Ignore_Expired_And_Recalled_Units()
    {
        var medicine = AddMedicine("Metformin", 10m, (100m, -3, false), (100m, 300, true), (2m, 30, false));
        AddMedicine("Losartan", 10m, (50m, 30, false));

        var suggestions = await new GetReorderSuggestionsQueryHandler(_db, _currentBranch)
            .Handle(new GetReorderSuggestionsQuery(), CancellationToken.None);

        var suggestion = suggestions.ShouldHaveSingleItem();
        suggestion.MedicineId.ShouldBe(medicine.Id);
        suggestion.TotalQuantityOnHand.ShouldBe(2m);
    }

    [Fact]
    public async Task Stats_LowStock_Should_Count_Sellable_Stock()
    {
        AddMedicine("Metformin", 10m, (100m, -3, false), (2m, 30, false));
        AddMedicine("Losartan", 10m, (50m, 30, false));

        var stats = await new GetMedicineStatsQueryHandler(_db, TimeProvider.System, _currentBranch)
            .Handle(new GetMedicineStatsQuery(), CancellationToken.None);

        stats.LowStock.ShouldBe(1);
    }

    public void Dispose() => _db.Dispose();
}
