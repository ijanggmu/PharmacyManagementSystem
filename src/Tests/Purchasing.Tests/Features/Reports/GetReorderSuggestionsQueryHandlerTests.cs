using FSH.Framework.Shared.Persistence;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Purchasing.Contracts.v1.Reports;
using FSH.Modules.Purchasing.Features.v1.Reports.GetReorderSuggestions;
using FSH.Modules.Sales.Contracts.v1.Reports;
using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using Mediator;
using NSubstitute;

namespace Purchasing.Tests.Features.Reports;

public sealed class GetReorderSuggestionsQueryHandlerTests
{
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly Guid _activeSupplier = Guid.CreateVersion7();
    private readonly Guid _inactiveSupplier = Guid.CreateVersion7();

#pragma warning disable CA2012 // NSubstitute stub set-up, not a consumed ValueTask
    public GetReorderSuggestionsQueryHandlerTests()
    {
        _mediator.Send(Arg.Any<GetMedicineSalesVelocityQuery>(), Arg.Any<CancellationToken>())
            .Returns((IReadOnlyDictionary<Guid, decimal>)new Dictionary<Guid, decimal>());
        _mediator.Send(Arg.Any<GetSupplierByIdQuery>(), Arg.Any<CancellationToken>())
            .Returns(ci =>
            {
                var id = ci.Arg<GetSupplierByIdQuery>().SupplierId;
                return new ValueTask<SupplierDto>(new SupplierDto(
                    id, id == _activeSupplier ? "Active" : "Dormant", null, null, null, null, null, 0m,
                    IsActive: id == _activeSupplier, DateTime.UtcNow, null));
            });
    }

    private void StubMedicines(params MedicineDto[] medicines) =>
        _mediator.Send(Arg.Any<SearchMedicinesQuery>(), Arg.Any<CancellationToken>())
            .Returns(new PagedResponse<MedicineDto> { Items = medicines, PageNumber = 1, PageSize = 200, TotalCount = medicines.Length, TotalPages = 1 });
#pragma warning restore CA2012

    private static MedicineDto Medicine(Guid supplierId, decimal physical, decimal sellable) => new(
        Id: Guid.CreateVersion7(), Name: "Metformin", GenericName: null, CategoryId: null, ReorderLevel: 10m,
        IsControlled: false, TotalQuantityOnHand: physical, IsArchived: false, CreatedAtUtc: DateTime.UtcNow, UpdatedAtUtc: null,
        SupplierId: supplierId, BranchQuantityOnHand: physical, BranchSellableQuantityOnHand: sellable);

    [Fact]
    public async Task Expired_Stock_Should_Not_Hide_A_Reorder_Need()
    {
        // 100 on the shelf, but only 2 sellable: below the reorder level of 10.
        var medicine = Medicine(_activeSupplier, physical: 100m, sellable: 2m);
        StubMedicines(medicine);

        var suggestions = await new GetReorderSuggestionsQueryHandler(_mediator)
            .Handle(new GetPurchasingReorderSuggestionsQuery(), CancellationToken.None);

        var suggestion = suggestions.ShouldHaveSingleItem();
        suggestion.MedicineId.ShouldBe(medicine.Id);
        suggestion.CurrentStock.ShouldBe(2m);
    }

    [Fact]
    public async Task Medicines_Of_An_Inactive_Supplier_Should_Be_Suggested_Without_A_Supplier()
    {
        StubMedicines(Medicine(_inactiveSupplier, physical: 0m, sellable: 0m));

        var suggestions = await new GetReorderSuggestionsQueryHandler(_mediator)
            .Handle(new GetPurchasingReorderSuggestionsQuery(), CancellationToken.None);

        var suggestion = suggestions.ShouldHaveSingleItem();
        suggestion.SupplierId.ShouldBeNull();
        suggestion.SupplierName.ShouldBeNull();
    }

    [Fact]
    public async Task Suggestion_Should_Use_The_Shared_Rule_And_The_Latest_Lot_Cost()
    {
        // Reorder level 50, no maximum, 10 sellable: target 2 x 50 = 100, so 90 — Inventory's figure too. The medicine
        // has no supplier and a stale cost price of 0; the latest lot cost 4.25.
        var medicine = new MedicineDto(
            Id: Guid.CreateVersion7(), Name: "Amoxicillin", GenericName: null, CategoryId: null, ReorderLevel: 50m,
            IsControlled: false, TotalQuantityOnHand: 10m, IsArchived: false, CreatedAtUtc: DateTime.UtcNow, UpdatedAtUtc: null,
            BranchQuantityOnHand: 10m, BranchSellableQuantityOnHand: 10m);
        StubMedicines(medicine);
#pragma warning disable CA2012 // NSubstitute stub set-up, not a consumed ValueTask
        _mediator.Send(Arg.Any<GetLatestLotPricesQuery>(), Arg.Any<CancellationToken>())
            .Returns((IReadOnlyDictionary<Guid, LatestLotPriceDto>)new Dictionary<Guid, LatestLotPriceDto>
            {
                [medicine.Id] = new(4.25m, 6m),
            });
#pragma warning restore CA2012

        var suggestion = (await new GetReorderSuggestionsQueryHandler(_mediator)
            .Handle(new GetPurchasingReorderSuggestionsQuery(), CancellationToken.None)).ShouldHaveSingleItem();

        suggestion.SuggestedQuantity.ShouldBe(90m);
        suggestion.UnitCost.ShouldBe(4.25m);
        suggestion.SupplierId.ShouldBeNull();
        suggestion.Reason.ShouldBe("below_minimum");
    }

    [Theory]
    [InlineData(50, null, 10, null, 90)]
    [InlineData(50, 200, 10, null, 190)]
    [InlineData(50, null, 10, 12, 96)]
    [InlineData(50, null, 120, null, 0)]
    [InlineData(0, null, 0, null, 0)]
    public void ReorderQuantity_Should_TopUp_To_Max_Else_Twice_The_Level_In_Whole_Packs(
        int reorderLevel, int? maximum, int onHand, int? unitsPerPack, int expected) =>
        ReorderQuantity.Suggest(reorderLevel, maximum, onHand, unitsPerPack).ShouldBe(expected);
}
