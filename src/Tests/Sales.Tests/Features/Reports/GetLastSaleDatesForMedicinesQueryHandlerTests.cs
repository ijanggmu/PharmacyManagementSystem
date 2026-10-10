using FSH.Modules.Sales.Contracts.v1.Reports;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Reports.GetLastSaleDatesForMedicines;
using Sales.Tests.Features;

namespace Sales.Tests.Features.Reports;

public sealed class GetLastSaleDatesForMedicinesQueryHandlerTests : IDisposable
{
    private readonly SalesDbContext _db = SalesDbContextFactory.Create();
    private readonly GetLastSaleDatesForMedicinesQueryHandler _sut;

    public GetLastSaleDatesForMedicinesQueryHandlerTests()
    {
        _sut = new GetLastSaleDatesForMedicinesQueryHandler(_db);
    }

    private async Task<(Guid MedicineId, DateTime SaleDateUtc)> SeedCompletedSaleAsync()
    {
        var medicineId = Guid.CreateVersion7();
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), null, null, null);
        sale.AddItem(medicineId, 5m, 10m, 0m, 0m, 5m);
        sale.Finalize("Cash", sale.TotalAmount);

        _db.Sales.Add(sale);
        await _db.SaveChangesAsync(CancellationToken.None);

        // Sale.StartBuilding stamps SaleDateUtc as DateTime.UtcNow internally (no setter exposed to
        // seed a specific value), so assert against whatever it actually stamped.
        return (medicineId, sale.SaleDateUtc);
    }

    [Fact]
    public async Task Handle_Should_Return_Empty_Dictionary_For_Empty_Input()
    {
        var result = await _sut.Handle(new GetLastSaleDatesForMedicinesQuery([]), CancellationToken.None);

        result.ShouldBeEmpty();
    }

    [Fact]
    public async Task Handle_Should_Return_LastSoldDate_For_Requested_Medicine()
    {
        // Arrange
        var (medicineId, saleDateUtc) = await SeedCompletedSaleAsync();

        // Act
        var result = await _sut.Handle(new GetLastSaleDatesForMedicinesQuery([medicineId]), CancellationToken.None);

        // Assert
        result.ShouldContainKey(medicineId);
        result[medicineId].ShouldBe(saleDateUtc);
    }

    [Fact]
    public async Task Handle_Should_Not_Include_Medicine_With_No_Completed_Sale()
    {
        var untouchedMedicineId = Guid.CreateVersion7();

        var result = await _sut.Handle(new GetLastSaleDatesForMedicinesQuery([untouchedMedicineId]), CancellationToken.None);

        result.ShouldNotContainKey(untouchedMedicineId);
    }

    [Fact]
    public async Task Handle_Should_Ignore_Cancelled_Sales()
    {
        // Arrange
        var medicineId = Guid.CreateVersion7();
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), null, null, null);
        sale.AddItem(medicineId, 1m, 10m, 0m, 0m, 5m);
        sale.Finalize("Cash", sale.TotalAmount);
        sale.Cancel("Customer changed mind");
        _db.Sales.Add(sale);
        await _db.SaveChangesAsync(CancellationToken.None);

        // Act
        var result = await _sut.Handle(new GetLastSaleDatesForMedicinesQuery([medicineId]), CancellationToken.None);

        // Assert
        result.ShouldNotContainKey(medicineId);
    }

    public void Dispose() => _db.Dispose();
}
