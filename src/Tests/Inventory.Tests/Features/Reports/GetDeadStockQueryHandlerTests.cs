using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Features.v1.Reports.GetDeadStock;
using FSH.Modules.Sales.Contracts.v1.Reports;
using Inventory.Tests.Features;
using Mediator;
using NSubstitute;

namespace Inventory.Tests.Features.Reports;

public sealed class GetDeadStockQueryHandlerTests : IDisposable
{
    private readonly InventoryDbContext _db = InventoryDbContextFactory.Create();
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly GetDeadStockQueryHandler _sut;

    /// <summary>A caller with access to every branch: the requested branch filter is used as given.</summary>
    private static FSH.Modules.Multitenancy.Contracts.ICurrentBranch AllBranches()
    {
        var branch = Substitute.For<FSH.Modules.Multitenancy.Contracts.ICurrentBranch>();
        branch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0));
        branch.CanViewAllBranchesAsync(Arg.Any<CancellationToken>()).Returns(true);
        return branch;
    }

    public GetDeadStockQueryHandlerTests()
    {
        _sut = new GetDeadStockQueryHandler(_db, _mediator, TimeProvider.System, AllBranches());
    }

    private async Task<Medicine> SeedMedicineWithBatchAsync(decimal quantity, decimal costPrice)
    {
        var medicine = Medicine.Create($"Med-{Guid.NewGuid():N}", null, null, reorderLevel: 5, isControlled: false);
        _db.Medicines.Add(medicine);

        var batch = MedicineBatch.Create(
            medicine.Id, Guid.CreateVersion7(), "B1", DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(6)), quantity, costPrice, costPrice * 1.5m, null);
        _db.MedicineBatches.Add(batch);

        await _db.SaveChangesAsync(CancellationToken.None);
        return medicine;
    }

    [Fact]
    public async Task Handle_Should_Include_Medicine_Never_Sold()
    {
        // Arrange — in stock, never sold (mediator returns an empty last-sold map).
        var medicine = await SeedMedicineWithBatchAsync(quantity: 10m, costPrice: 4m);
        _mediator.Send(Arg.Any<GetLastSaleDatesForMedicinesQuery>(), Arg.Any<CancellationToken>())
            .Returns(new Dictionary<Guid, DateTime>());

        // Act
        var result = await _sut.Handle(new GetDeadStockQuery(SinceDays: 90), CancellationToken.None);

        // Assert
        var row = result.Items.ShouldHaveSingleItem();
        row.MedicineId.ShouldBe(medicine.Id);
        row.StockQuantity.ShouldBe(10m);
        row.InventoryValue.ShouldBe(40m);
        row.LastSoldAtUtc.ShouldBeNull();
    }

    [Fact]
    public async Task Handle_Should_Exclude_Medicine_Sold_Recently()
    {
        // Arrange — last sold yesterday, well inside the 90-day window.
        var medicine = await SeedMedicineWithBatchAsync(quantity: 10m, costPrice: 4m);
        _mediator.Send(Arg.Any<GetLastSaleDatesForMedicinesQuery>(), Arg.Any<CancellationToken>())
            .Returns(new Dictionary<Guid, DateTime> { [medicine.Id] = DateTime.UtcNow.AddDays(-1) });

        // Act
        var result = await _sut.Handle(new GetDeadStockQuery(SinceDays: 90), CancellationToken.None);

        // Assert
        result.Items.ShouldBeEmpty();
    }

    [Fact]
    public async Task Handle_Should_Include_Medicine_Sold_Beyond_Cutoff()
    {
        // Arrange — last sold 120 days ago, outside the default 90-day window.
        var medicine = await SeedMedicineWithBatchAsync(quantity: 3m, costPrice: 10m);
        _mediator.Send(Arg.Any<GetLastSaleDatesForMedicinesQuery>(), Arg.Any<CancellationToken>())
            .Returns(new Dictionary<Guid, DateTime> { [medicine.Id] = DateTime.UtcNow.AddDays(-120) });

        // Act
        var result = await _sut.Handle(new GetDeadStockQuery(SinceDays: 90), CancellationToken.None);

        // Assert
        result.Items.ShouldHaveSingleItem().MedicineId.ShouldBe(medicine.Id);
    }

    [Fact]
    public async Task Handle_Should_Exclude_Medicine_With_No_Stock()
    {
        // Arrange — zero quantity on hand must never appear regardless of sale history.
        await SeedMedicineWithBatchAsync(quantity: 0m, costPrice: 4m);

        // Act
        var result = await _sut.Handle(new GetDeadStockQuery(), CancellationToken.None);

        // Assert
        result.Items.ShouldBeEmpty();
        await _mediator.DidNotReceive().Send(Arg.Any<GetLastSaleDatesForMedicinesQuery>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_Should_Sort_By_InventoryValue_Descending()
    {
        // Arrange
        var cheap = await SeedMedicineWithBatchAsync(quantity: 10m, costPrice: 1m);   // value 10
        var expensive = await SeedMedicineWithBatchAsync(quantity: 10m, costPrice: 50m); // value 500
        _mediator.Send(Arg.Any<GetLastSaleDatesForMedicinesQuery>(), Arg.Any<CancellationToken>())
            .Returns(new Dictionary<Guid, DateTime>());

        // Act
        var result = await _sut.Handle(new GetDeadStockQuery(), CancellationToken.None);

        // Assert
        result.Items.Count.ShouldBe(2);
        var ordered = result.Items.ToList();
        ordered[0].MedicineId.ShouldBe(expensive.Id);
        ordered[1].MedicineId.ShouldBe(cheap.Id);
    }

    public void Dispose() => _db.Dispose();
}
