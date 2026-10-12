using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Dtos;
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

        _mediator.Send(Arg.Is<LookupCustomersQuery>(q => q.CustomerIds!.Contains(customerId)), Arg.Any<CancellationToken>())
            .Returns(new List<CustomerLookupDto> { new(customerId, "Jane Doe", null) });

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
    public async Task Handle_Should_Keep_Cancelled_Sale_And_Add_Negative_Cancellation_Row_When_Cancelled_In_Period()
    {
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), null, null, null);
        sale.AddItem(Guid.CreateVersion7(), 1m, 5m, 0m, 0m, 2m);
        sale.Finalize("Cash", sale.TotalAmount);
        sale.AssignInvoiceNumberIfMissing("INV-1");
        sale.Cancel("customer return");
        _db.Sales.Add(sale);
        await _db.SaveChangesAsync(CancellationToken.None);

        var result = await _sut.Handle(
            new GetIrdSalesRegisterQuery(sale.SaleDateUtc.AddDays(-1), sale.SaleDateUtc.AddDays(1)), CancellationToken.None);

        result.Count.ShouldBe(2);
        result[0].RowType.ShouldBe(IrdRegisterRowTypes.Sale);
        result[0].TotalAmount.ShouldBe(5m);
        result[1].RowType.ShouldBe(IrdRegisterRowTypes.Cancellation);
        result[1].TotalAmount.ShouldBe(-5m);
        result[1].SaleDateUtc.ShouldBe(sale.CancelledAtUtc!.Value);
        result[1].OriginalInvoiceNumber.ShouldBe("INV-1");
        result.Sum(r => r.TotalAmount).ShouldBe(0m);
    }

    [Fact]
    public async Task Handle_Should_Not_Drop_A_Sale_From_Its_Period_When_Cancelled_Later()
    {
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), null, null, null);
        sale.AddItem(Guid.CreateVersion7(), 1m, 5m, 0m, 0m, 2m);
        sale.Finalize("Cash", sale.TotalAmount);
        await Task.Delay(30);
        sale.Cancel("void");
        _db.Sales.Add(sale);
        await _db.SaveChangesAsync(CancellationToken.None);

        // The period the invoice was issued in (it closes before the cancellation).
        var issuedPeriod = await _sut.Handle(
            new GetIrdSalesRegisterQuery(sale.SaleDateUtc.AddDays(-1), sale.SaleDateUtc), CancellationToken.None);
        // The period the cancellation falls in (after the invoice).
        var cancelPeriod = await _sut.Handle(
            new GetIrdSalesRegisterQuery(sale.SaleDateUtc.AddMilliseconds(1), sale.CancelledAtUtc!.Value.AddDays(1)), CancellationToken.None);

        issuedPeriod.ShouldHaveSingleItem().TotalAmount.ShouldBe(5m);
        var reversal = cancelPeriod.ShouldHaveSingleItem();
        reversal.RowType.ShouldBe(IrdRegisterRowTypes.Cancellation);
        reversal.TotalAmount.ShouldBe(-5m);
    }

    [Fact]
    public async Task Handle_Should_Add_Negative_Credit_Note_Row_For_A_Completed_Return()
    {
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), null, null, null);
        sale.AddItem(Guid.CreateVersion7(), 2m, 113m, 0m, 0m, 50m);
        sale.Finalize("Cash", sale.TotalAmount);
        sale.ApplyVat(13m);
        sale.AssignInvoiceNumberIfMissing("INV-7");
        _db.Sales.Add(sale);

        var saleReturn = SaleReturn.Create(sale.BranchId, sale.Id, null, DateTime.UtcNow, ReturnStatus.Completed, "damaged", null, "cash");
        saleReturn.AddItem(sale.Items[0].Id, sale.Items[0].MedicineId, 1m, 113m, 50m, "damaged", PackagingCondition.Sealed, 113m);
        saleReturn.ApplyVatBreakdown(VatBreakdown.Compute(13m, [(113m, true)]));
        saleReturn.AssignCreditNote("CN-MAIN-2083/84-00001", 2083);
        saleReturn.MarkStockRestoredIfNeeded();
        _db.SaleReturns.Add(saleReturn);
        await _db.SaveChangesAsync(CancellationToken.None);

        var result = await _sut.Handle(
            new GetIrdSalesRegisterQuery(DateTime.UtcNow.AddDays(-1), DateTime.UtcNow.AddDays(1)), CancellationToken.None);

        result.Count.ShouldBe(2);
        var credit = result.Single(r => r.RowType == IrdRegisterRowTypes.Return);
        credit.TotalAmount.ShouldBe(-113m);
        credit.TaxAmount.ShouldBe(-13m);
        credit.TaxableAmount.ShouldBe(-100m);
        credit.DocumentNumber.ShouldBe("CN-MAIN-2083/84-00001");
        credit.OriginalInvoiceNumber.ShouldBe("INV-7");
        result.Sum(r => r.TaxAmount ?? 0m).ShouldBe(13m);
    }

    public void Dispose() => _db.Dispose();
}
