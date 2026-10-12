using FSH.Framework.Shared.Persistence;
using FSH.Modules.Inventory.Contracts.Dtos;
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
    public async Task Medicines_Of_An_Inactive_Supplier_Should_Not_Be_Suggested()
    {
        StubMedicines(Medicine(_inactiveSupplier, physical: 0m, sellable: 0m));

        var suggestions = await new GetReorderSuggestionsQueryHandler(_mediator)
            .Handle(new GetPurchasingReorderSuggestionsQuery(), CancellationToken.None);

        suggestions.ShouldBeEmpty();
    }
}
