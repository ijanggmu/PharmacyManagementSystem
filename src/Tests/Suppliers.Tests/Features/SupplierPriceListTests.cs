using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Suppliers.Contracts.v1.PriceLists;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Features.v1.PriceLists.DeleteSupplierPriceListItem;
using FSH.Modules.Suppliers.Features.v1.PriceLists.GetSupplierPrices;
using FSH.Modules.Suppliers.Features.v1.PriceLists.SearchSupplierPriceList;
using FSH.Modules.Suppliers.Features.v1.PriceLists.UpsertSupplierPriceListItem;
using Mediator;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Suppliers.Tests.Features;

/// <summary>Supplier price lists: upsert rules, validity-window selection, deactivation and validators.</summary>
public sealed class SupplierPriceListTests : IDisposable
{
    private readonly SuppliersDbContext _db = SuppliersDbContextFactory.Create();
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly Guid _cetamol = Guid.CreateVersion7();
    private readonly Guid _amox = Guid.CreateVersion7();

    public SupplierPriceListTests()
    {
        var known = new Dictionary<Guid, (string Name, int? Pack)> { [_cetamol] = ("Cetamol 500mg", 10), [_amox] = ("Amoxicillin 250mg", null) };
        _mediator.Send(Arg.Any<GetMedicineByIdQuery>(), Arg.Any<CancellationToken>())
            .Returns(ci =>
            {
                Guid id = ci.Arg<GetMedicineByIdQuery>().MedicineId;
                if (!known.TryGetValue(id, out var m))
                {
                    throw new NotFoundException($"Medicine {id} not found.");
                }

                return new MedicineDto(id, m.Name, null, null, 0m, false, 0m, false, DateTime.UtcNow, null, UnitsPerPack: m.Pack);
            });
        _mediator.Send(Arg.Any<GetMedicineNamesQuery>(), Arg.Any<CancellationToken>())
            .Returns(ci => (IReadOnlyDictionary<Guid, string>)ci.Arg<GetMedicineNamesQuery>().MedicineIds
                .Where(known.ContainsKey).Distinct().ToDictionary(id => id, id => known[id].Name));
    }

    public void Dispose() => _db.Dispose();

    private UpsertSupplierPriceListItemCommandHandler Upsert => new(_db, _mediator);

    [Fact]
    public async Task Upsert_Should_Create_Then_Update_The_Same_Row()
    {
        var supplier = await SeedSupplierAsync();

        Guid id = await Upsert.Handle(
            new UpsertSupplierPriceListItemCommand(supplier.Id, _cetamol, 1.25m, new DateOnly(2026, 10, 1), Notes: "  Dashain rate "),
            CancellationToken.None);
        Guid same = await Upsert.Handle(
            new UpsertSupplierPriceListItemCommand(supplier.Id, _cetamol, 1.10m, new DateOnly(2026, 10, 1), new DateOnly(2026, 12, 31), 100m, ItemId: id),
            CancellationToken.None);

        same.ShouldBe(id);
        var row = await _db.SupplierPriceListItems.SingleAsync();
        row.UnitCost.ShouldBe(1.10m);
        row.ValidTo.ShouldBe(new DateOnly(2026, 12, 31));
        row.MinOrderQuantity.ShouldBe(100m);
        row.Notes.ShouldBeNull();
        row.UpdatedAtUtc.ShouldNotBeNull();
    }

    [Fact]
    public async Task Upsert_Should_Refuse_A_Second_Active_Row_Starting_The_Same_Day()
    {
        var supplier = await SeedSupplierAsync();
        await Upsert.Handle(new UpsertSupplierPriceListItemCommand(supplier.Id, _cetamol, 1.25m, new DateOnly(2026, 10, 1)), CancellationToken.None);

        var ex = await Should.ThrowAsync<CustomException>(async () => await Upsert.Handle(
            new UpsertSupplierPriceListItemCommand(supplier.Id, _cetamol, 1.30m, new DateOnly(2026, 10, 1)), CancellationToken.None));

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        // A different start date, or another medicine on the same day, is fine.
        await Upsert.Handle(new UpsertSupplierPriceListItemCommand(supplier.Id, _cetamol, 1.30m, new DateOnly(2026, 11, 1)), CancellationToken.None);
        await Upsert.Handle(new UpsertSupplierPriceListItemCommand(supplier.Id, _amox, 4m, new DateOnly(2026, 10, 1)), CancellationToken.None);
        (await _db.SupplierPriceListItems.CountAsync()).ShouldBe(3);
    }

    [Fact]
    public async Task Upsert_Should_Allow_Reusing_A_Start_Date_After_The_Old_Row_Was_Removed()
    {
        var supplier = await SeedSupplierAsync();
        Guid id = await Upsert.Handle(new UpsertSupplierPriceListItemCommand(supplier.Id, _cetamol, 1.25m, new DateOnly(2026, 10, 1)), CancellationToken.None);
        await new DeleteSupplierPriceListItemCommandHandler(_db).Handle(new DeleteSupplierPriceListItemCommand(supplier.Id, id), CancellationToken.None);

        Guid again = await Upsert.Handle(new UpsertSupplierPriceListItemCommand(supplier.Id, _cetamol, 1.40m, new DateOnly(2026, 10, 1)), CancellationToken.None);

        again.ShouldNotBe(id);
    }

    [Fact]
    public async Task Upsert_Should_Return_Conflict_For_An_Inactive_Supplier()
    {
        var supplier = await SeedSupplierAsync();
        supplier.Update(supplier.Name, null, null, null, null, null, isActive: false);
        await _db.SaveChangesAsync();

        var ex = await Should.ThrowAsync<CustomException>(async () => await Upsert.Handle(
            new UpsertSupplierPriceListItemCommand(supplier.Id, _cetamol, 1m, new DateOnly(2026, 10, 1)), CancellationToken.None));

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Upsert_Should_Return_NotFound_For_An_Unknown_Supplier_Or_Medicine()
    {
        var supplier = await SeedSupplierAsync();

        await Should.ThrowAsync<NotFoundException>(async () => await Upsert.Handle(
            new UpsertSupplierPriceListItemCommand(Guid.CreateVersion7(), _cetamol, 1m, new DateOnly(2026, 10, 1)), CancellationToken.None));
        await Should.ThrowAsync<NotFoundException>(async () => await Upsert.Handle(
            new UpsertSupplierPriceListItemCommand(supplier.Id, Guid.CreateVersion7(), 1m, new DateOnly(2026, 10, 1)), CancellationToken.None));
    }

    [Fact]
    public async Task GetSupplierPrices_Should_Pick_The_Latest_Window_Covering_The_Date()
    {
        var supplier = await SeedSupplierAsync();
        var other = await SeedSupplierAsync("Other Pharma");
        await AddAsync(supplier.Id, _cetamol, 1.00m, new DateOnly(2026, 1, 1), null);
        await AddAsync(supplier.Id, _cetamol, 1.20m, new DateOnly(2026, 6, 1), new DateOnly(2026, 8, 31));
        await AddAsync(supplier.Id, _cetamol, 1.50m, new DateOnly(2026, 12, 1), null);
        await AddAsync(other.Id, _cetamol, 0.50m, new DateOnly(2026, 1, 1), null);
        var handler = new GetSupplierPricesQueryHandler(_db, _mediator);

        async Task<decimal?> PriceOn(DateOnly date)
        {
            var prices = await handler.Handle(new GetSupplierPricesQuery(supplier.Id, [_cetamol, _amox], date), CancellationToken.None);
            return prices.SingleOrDefault()?.UnitCost;
        }

        (await PriceOn(new DateOnly(2025, 12, 31))).ShouldBeNull();
        (await PriceOn(new DateOnly(2026, 3, 15))).ShouldBe(1.00m);
        (await PriceOn(new DateOnly(2026, 6, 1))).ShouldBe(1.20m);
        (await PriceOn(new DateOnly(2026, 8, 31))).ShouldBe(1.20m);
        // The summer price ended: the open-ended January price applies again.
        (await PriceOn(new DateOnly(2026, 9, 1))).ShouldBe(1.00m);
        (await PriceOn(new DateOnly(2026, 12, 1))).ShouldBe(1.50m);

        var price = (await handler.Handle(new GetSupplierPricesQuery(supplier.Id, [_cetamol], new DateOnly(2026, 7, 1)), CancellationToken.None))
            .ShouldHaveSingleItem();
        price.MedicineName.ShouldBe("Cetamol 500mg");
        price.SupplierId.ShouldBe(supplier.Id);
    }

    [Fact]
    public async Task Delete_Should_Deactivate_So_The_Row_No_Longer_Prices_Orders()
    {
        var supplier = await SeedSupplierAsync();
        var item = await AddAsync(supplier.Id, _cetamol, 1.00m, new DateOnly(2026, 1, 1), null);

        await new DeleteSupplierPriceListItemCommandHandler(_db).Handle(
            new DeleteSupplierPriceListItemCommand(supplier.Id, item.Id), CancellationToken.None);

        (await _db.SupplierPriceListItems.SingleAsync()).IsActive.ShouldBeFalse();
        (await new GetSupplierPricesQueryHandler(_db, _mediator).Handle(
            new GetSupplierPricesQuery(supplier.Id, [_cetamol], new DateOnly(2026, 5, 1)), CancellationToken.None)).ShouldBeEmpty();
        await Should.ThrowAsync<NotFoundException>(async () => await new DeleteSupplierPriceListItemCommandHandler(_db).Handle(
            new DeleteSupplierPriceListItemCommand(Guid.CreateVersion7(), item.Id), CancellationToken.None));
    }

    [Fact]
    public async Task Search_Should_Filter_By_Supplier_And_Date_And_Resolve_Medicines()
    {
        var supplier = await SeedSupplierAsync();
        await AddAsync(supplier.Id, _cetamol, 1.00m, new DateOnly(2026, 1, 1), new DateOnly(2026, 3, 31));
        await AddAsync(supplier.Id, _amox, 4.00m, new DateOnly(2026, 1, 1), null);
        var removed = await AddAsync(supplier.Id, _amox, 3.00m, new DateOnly(2025, 1, 1), null);
        removed.Deactivate(DateTime.UtcNow);
        await _db.SaveChangesAsync();
        var handler = new SearchSupplierPriceListQueryHandler(_db, _mediator);

        var all = await handler.Handle(new SearchSupplierPriceListQuery(supplier.Id), CancellationToken.None);
        var inApril = await handler.Handle(new SearchSupplierPriceListQuery(supplier.Id, ActiveOn: new DateOnly(2026, 4, 1)), CancellationToken.None);

        all.TotalCount.ShouldBe(2);
        all.Items.Select(i => i.MedicineName).ShouldBe(["Amoxicillin 250mg", "Cetamol 500mg"]);
        all.Items.Single(i => i.MedicineId == _cetamol).UnitsPerPack.ShouldBe(10);
        inApril.Items.ShouldHaveSingleItem().MedicineId.ShouldBe(_amox);
    }

    [Fact]
    public void Domain_Should_Reject_Bad_Values()
    {
        Should.Throw<ArgumentOutOfRangeException>(() =>
            SupplierPriceListItem.Create(Guid.NewGuid(), _cetamol, 0m, null, new DateOnly(2026, 1, 1), null, null, DateTime.UtcNow));
        Should.Throw<ArgumentOutOfRangeException>(() =>
            SupplierPriceListItem.Create(Guid.NewGuid(), _cetamol, 1m, null, new DateOnly(2026, 2, 1), new DateOnly(2026, 1, 31), null, DateTime.UtcNow));
        var item = SupplierPriceListItem.Create(Guid.NewGuid(), _cetamol, 1m, null, new DateOnly(2026, 2, 1), new DateOnly(2026, 2, 1), null, DateTime.UtcNow);
        item.IsValidOn(new DateOnly(2026, 2, 1)).ShouldBeTrue();
        item.IsValidOn(new DateOnly(2026, 2, 2)).ShouldBeFalse();
    }

    [Fact]
    public void UpsertValidator_Should_Check_Cost_Window_And_Notes()
    {
        var validator = new UpsertSupplierPriceListItemCommandValidator();
        var ok = new UpsertSupplierPriceListItemCommand(Guid.NewGuid(), Guid.NewGuid(), 1.2345m, new DateOnly(2026, 1, 1));

        validator.Validate(ok).IsValid.ShouldBeTrue();
        validator.Validate(ok with { UnitCost = 0m }).IsValid.ShouldBeFalse();
        validator.Validate(ok with { UnitCost = 1.23456m }).IsValid.ShouldBeFalse();
        validator.Validate(ok with { ValidTo = new DateOnly(2025, 12, 31) }).IsValid.ShouldBeFalse();
        validator.Validate(ok with { MinOrderQuantity = 0m }).IsValid.ShouldBeFalse();
        validator.Validate(ok with { Notes = new string('x', 201) }).IsValid.ShouldBeFalse();
        validator.Validate(ok with { MedicineId = Guid.Empty }).IsValid.ShouldBeFalse();
        validator.Validate(ok with { ValidFrom = default }).IsValid.ShouldBeFalse();
    }

    [Fact]
    public void Query_And_Delete_Validators_Should_Check_Bounds()
    {
        var search = new SearchSupplierPriceListQueryValidator();
        search.Validate(new SearchSupplierPriceListQuery(Guid.NewGuid())).IsValid.ShouldBeTrue();
        search.Validate(new SearchSupplierPriceListQuery(PageSize: 101)).IsValid.ShouldBeFalse();
        search.Validate(new SearchSupplierPriceListQuery(PageNumber: 0)).IsValid.ShouldBeFalse();

        var lookup = new GetSupplierPricesQueryValidator();
        lookup.Validate(new GetSupplierPricesQuery(Guid.NewGuid(), [Guid.NewGuid()], new DateOnly(2026, 1, 1))).IsValid.ShouldBeTrue();
        lookup.Validate(new GetSupplierPricesQuery(Guid.Empty, [], new DateOnly(2026, 1, 1))).IsValid.ShouldBeFalse();
        lookup.Validate(new GetSupplierPricesQuery(Guid.NewGuid(), Enumerable.Range(0, 501).Select(_ => Guid.NewGuid()).ToList(), new DateOnly(2026, 1, 1)))
            .IsValid.ShouldBeFalse();

        var delete = new DeleteSupplierPriceListItemCommandValidator();
        delete.Validate(new DeleteSupplierPriceListItemCommand(Guid.NewGuid(), Guid.Empty)).IsValid.ShouldBeFalse();
    }

    private async Task<Supplier> SeedSupplierAsync(string name = "Acme Pharma")
    {
        var supplier = Supplier.Create(name, null, null, null, null, null, 0m);
        _db.Suppliers.Add(supplier);
        await _db.SaveChangesAsync();
        return supplier;
    }

    private async Task<SupplierPriceListItem> AddAsync(Guid supplierId, Guid medicineId, decimal cost, DateOnly from, DateOnly? to)
    {
        var item = SupplierPriceListItem.Create(supplierId, medicineId, cost, null, from, to, null, DateTime.UtcNow);
        _db.SupplierPriceListItems.Add(item);
        await _db.SaveChangesAsync();
        return item;
    }
}
