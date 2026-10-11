using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Prescriptions.Contracts.Dtos;
using FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;
using FSH.Modules.Sales.Contracts.v1.Reports;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Reports.GetNarcoticRegister;
using Mediator;
using NSubstitute;
using Sales.Tests.Features;

namespace Sales.Tests.Features.Reports;

public sealed class GetNarcoticRegisterQueryHandlerTests : IDisposable
{
    private readonly SalesDbContext _db = SalesDbContextFactory.Create();
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly GetNarcoticRegisterQueryHandler _sut;

    public GetNarcoticRegisterQueryHandlerTests()
    {
        _sut = new GetNarcoticRegisterQueryHandler(_db, _mediator, Substitute.For<FSH.Modules.Multitenancy.Contracts.ICurrentBranch>());
    }

    [Fact]
    public async Task Handle_Should_Return_Empty_When_No_Controlled_Medicines_Exist()
    {
        _mediator.Send(Arg.Any<GetControlledMedicinesQuery>(), Arg.Any<CancellationToken>())
            .Returns(new List<ControlledMedicineDto>());

        var result = await _sut.Handle(new GetNarcoticRegisterQuery(DateTime.UtcNow.AddDays(-1), DateTime.UtcNow.AddDays(1)), CancellationToken.None);

        result.Items.ShouldBeEmpty();
    }

    [Fact]
    public async Task Handle_Should_Return_Row_For_Dispensed_Controlled_Medicine_Within_Period()
    {
        // Arrange
        var customerId = Guid.CreateVersion7();
        var prescriptionId = Guid.CreateVersion7();
        var controlledMedicineId = Guid.CreateVersion7();

        var sale = Sale.StartBuilding(Guid.CreateVersion7(), customerId, prescriptionId, null);
        sale.AddItem(controlledMedicineId, 2m, 15m, 0m, 0m, 8m);
        sale.Finalize("Cash", sale.TotalAmount);
        _db.Sales.Add(sale);
        await _db.SaveChangesAsync(CancellationToken.None);

        _mediator.Send(Arg.Any<GetControlledMedicinesQuery>(), Arg.Any<CancellationToken>())
            .Returns(new List<ControlledMedicineDto> { new(controlledMedicineId, "Morphine 10mg", "Morphine") });
        _mediator.Send(Arg.Is<GetCustomerByIdQuery>(q => q.CustomerId == customerId), Arg.Any<CancellationToken>())
            .Returns(new CustomerDto(customerId, "Jane Doe", null, null, null, 0m, true, DateTime.UtcNow, null));
        _mediator.Send(Arg.Is<GetPrescriptionByIdQuery>(q => q.PrescriptionId == prescriptionId), Arg.Any<CancellationToken>())
            .Returns(new PrescriptionDto(
                prescriptionId, customerId, "Jane Doe", "Dr. Smith",
                DateOnly.FromDateTime(DateTime.UtcNow), DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(1)),
                "Active", DateTime.UtcNow, null, null, []));

        // Act
        var result = await _sut.Handle(
            new GetNarcoticRegisterQuery(sale.SaleDateUtc.AddDays(-1), sale.SaleDateUtc.AddDays(1)), CancellationToken.None);

        // Assert
        var row = result.Items.ShouldHaveSingleItem();
        row.SaleId.ShouldBe(sale.Id);
        row.MedicineId.ShouldBe(controlledMedicineId);
        row.MedicineName.ShouldBe("Morphine 10mg");
        row.CustomerId.ShouldBe(customerId);
        row.CustomerName.ShouldBe("Jane Doe");
        row.PrescriptionId.ShouldBe(prescriptionId);
        row.DoctorName.ShouldBe("Dr. Smith");
        row.Quantity.ShouldBe(2m);
        row.UnitPrice.ShouldBe(15m);
        row.LineTotal.ShouldBe(30m);
    }

    [Fact]
    public async Task Handle_Should_Exclude_Sale_Items_For_NonControlled_Medicines()
    {
        // Arrange — sale dispenses a medicine that is NOT in the controlled set.
        var uncontrolledMedicineId = Guid.CreateVersion7();
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), null, null, null);
        sale.AddItem(uncontrolledMedicineId, 1m, 5m, 0m, 0m, 2m);
        sale.Finalize("Cash", sale.TotalAmount);
        _db.Sales.Add(sale);
        await _db.SaveChangesAsync(CancellationToken.None);

        _mediator.Send(Arg.Any<GetControlledMedicinesQuery>(), Arg.Any<CancellationToken>())
            .Returns(new List<ControlledMedicineDto> { new(Guid.CreateVersion7(), "Some Narcotic", null) });

        // Act
        var result = await _sut.Handle(
            new GetNarcoticRegisterQuery(sale.SaleDateUtc.AddDays(-1), sale.SaleDateUtc.AddDays(1)), CancellationToken.None);

        // Assert
        result.Items.ShouldBeEmpty();
    }

    [Fact]
    public async Task Handle_Should_Exclude_Sale_Outside_Period()
    {
        var controlledMedicineId = Guid.CreateVersion7();
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), null, null, null);
        sale.AddItem(controlledMedicineId, 1m, 5m, 0m, 0m, 2m);
        sale.Finalize("Cash", sale.TotalAmount);
        _db.Sales.Add(sale);
        await _db.SaveChangesAsync(CancellationToken.None);

        _mediator.Send(Arg.Any<GetControlledMedicinesQuery>(), Arg.Any<CancellationToken>())
            .Returns(new List<ControlledMedicineDto> { new(controlledMedicineId, "Morphine", null) });

        // Act — period entirely before the sale.
        var result = await _sut.Handle(
            new GetNarcoticRegisterQuery(sale.SaleDateUtc.AddDays(-10), sale.SaleDateUtc.AddDays(-5)), CancellationToken.None);

        // Assert
        result.Items.ShouldBeEmpty();
    }

    public void Dispose() => _db.Dispose();
}
