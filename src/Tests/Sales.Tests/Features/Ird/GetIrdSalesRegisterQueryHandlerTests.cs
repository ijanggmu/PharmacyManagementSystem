using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.v1.Ird;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Ird.GetIrdSalesRegister;
using Mediator;
using NSubstitute;
using Sales.Tests.Features;

namespace Sales.Tests.Features.Ird;

public sealed class GetIrdSalesRegisterQueryHandlerTests : IDisposable
{
    private readonly SalesDbContext _db = SalesDbContextFactory.Create();
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly GetIrdSalesRegisterQueryHandler _sut;

    public GetIrdSalesRegisterQueryHandlerTests()
    {
        // Unfiltered branch scope by default, matching the pre-existing (unscoped) test behaviour.
        _currentBranch.GetListFilterBranchIdAsync(Arg.Any<CancellationToken>()).Returns((Guid?)null);
        _sut = new GetIrdSalesRegisterQueryHandler(_db, _mediator, _currentBranch);
    }

    [Fact]
    public async Task Handle_Should_Return_Empty_When_No_Sales_In_Period()
    {
        var result = await _sut.Handle(
            new GetIrdSalesRegisterQuery(DateTime.UtcNow.AddDays(-1), DateTime.UtcNow.AddDays(1)), CancellationToken.None);

        result.ShouldBeEmpty();
    }

    [Fact]
    public async Task Handle_Should_Return_Row_With_Resolved_CustomerName()
    {
        // Arrange
        var customerId = Guid.CreateVersion7();
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), customerId, null, null);
        sale.AddItem(Guid.CreateVersion7(), 2m, 15m, 0m, 0m, 8m);
        sale.Finalize("Cash", sale.TotalAmount);
        sale.AssignInvoiceNumberIfMissing("INV-260915-0001");
        _db.Sales.Add(sale);
        await _db.SaveChangesAsync(CancellationToken.None);

        _mediator.Send(Arg.Is<GetCustomerByIdQuery>(q => q.CustomerId == customerId), Arg.Any<CancellationToken>())
            .Returns(new CustomerDto(customerId, "Jane Doe", null, null, null, 0m, true, DateTime.UtcNow, null));

        // Act
        var result = await _sut.Handle(
            new GetIrdSalesRegisterQuery(sale.SaleDateUtc.AddDays(-1), sale.SaleDateUtc.AddDays(1)), CancellationToken.None);

        // Assert
        var row = result.ShouldHaveSingleItem();
        row.SaleId.ShouldBe(sale.Id);
        row.InvoiceNumber.ShouldBe("INV-260915-0001");
        row.TotalAmount.ShouldBe(30m);
        row.IrdStatus.ShouldBe("Pending");
        row.CustomerId.ShouldBe(customerId);
        row.CustomerName.ShouldBe("Jane Doe");
    }

    [Fact]
    public async Task Handle_Should_Use_WalkIn_Label_When_No_Customer()
    {
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), null, null, null);
        sale.AddItem(Guid.CreateVersion7(), 1m, 5m, 0m, 0m, 2m);
        sale.Finalize("Cash", sale.TotalAmount);
        _db.Sales.Add(sale);
        await _db.SaveChangesAsync(CancellationToken.None);

        var result = await _sut.Handle(
            new GetIrdSalesRegisterQuery(sale.SaleDateUtc.AddDays(-1), sale.SaleDateUtc.AddDays(1)), CancellationToken.None);

        result.ShouldHaveSingleItem().CustomerName.ShouldBe("Walk-in");
    }

    [Fact]
    public async Task Handle_Should_Exclude_Sale_Outside_Period()
    {
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), null, null, null);
        sale.AddItem(Guid.CreateVersion7(), 1m, 5m, 0m, 0m, 2m);
        sale.Finalize("Cash", sale.TotalAmount);
        _db.Sales.Add(sale);
        await _db.SaveChangesAsync(CancellationToken.None);

        var result = await _sut.Handle(
            new GetIrdSalesRegisterQuery(sale.SaleDateUtc.AddDays(-10), sale.SaleDateUtc.AddDays(-5)), CancellationToken.None);

        result.ShouldBeEmpty();
    }

    [Fact]
    public async Task Handle_Should_Exclude_Cancelled_Sale()
    {
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), null, null, null);
        sale.AddItem(Guid.CreateVersion7(), 1m, 5m, 0m, 0m, 2m);
        sale.Finalize("Cash", sale.TotalAmount);
        sale.Cancel("customer return");
        _db.Sales.Add(sale);
        await _db.SaveChangesAsync(CancellationToken.None);

        var result = await _sut.Handle(
            new GetIrdSalesRegisterQuery(sale.SaleDateUtc.AddDays(-1), sale.SaleDateUtc.AddDays(1)), CancellationToken.None);

        result.ShouldBeEmpty();
    }

    public void Dispose() => _db.Dispose();
}
