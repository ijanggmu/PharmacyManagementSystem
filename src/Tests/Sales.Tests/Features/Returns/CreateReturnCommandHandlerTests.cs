using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.v1.Returns;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Returns.CreateReturn;
using FSH.Modules.Sales.Services;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Sales.Tests.Features.Returns;

public sealed class CreateReturnCommandHandlerTests : IDisposable
{
    private readonly SalesDbContext _db = SalesDbContextFactory.Create();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly IInvoiceNumberService _invoiceNumbers = Substitute.For<IInvoiceNumberService>();
    private readonly CreateReturnCommandHandler _sut;

    public CreateReturnCommandHandlerTests()
    {
        _currentUser.GetTenant().Returns("test-tenant");
        _currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(Guid.CreateVersion7());
        _invoiceNumbers.ResolveContextAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>())
            .Returns(new InvoiceNumberContext("INV", "MAIN"));
        _invoiceNumbers.ReserveNextCreditNoteAsync(Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns(1, 2, 3);
        _sut = new CreateReturnCommandHandler(_db, _outbox, _currentUser, _currentBranch, _invoiceNumbers);
    }

    private async Task<Sale> SeedCompletedSaleAsync(decimal quantity = 10m, decimal unitPrice = 20m, decimal unitCost = 12m)
    {
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), Guid.CreateVersion7(), null, null);
        sale.AddItem(Guid.CreateVersion7(), quantity, unitPrice, 0m, 0m, unitCost);
        sale.Finalize("Cash", sale.TotalAmount);
        _db.Sales.Add(sale);
        await _db.SaveChangesAsync(CancellationToken.None);
        return sale;
    }

    #region Happy Path

    [Fact]
    public async Task Handle_Should_CreateReturn_And_RestoreStock_When_StatusCompleted()
    {
        // Arrange
        var sale = await SeedCompletedSaleAsync(quantity: 10m, unitPrice: 20m);
        var saleItem = sale.Items[0];
        var command = new CreateReturnCommand(
            sale.Id, sale.CustomerId, DateTime.UtcNow,
            [new ReturnItemInput(saleItem.Id, 3m, "Wrong item", "sealed")],
            Status: "completed");

        // Act
        var returnId = await _sut.Handle(command, CancellationToken.None);

        // Assert
        returnId.ShouldNotBe(Guid.Empty);
        var saved = await _db.SaleReturns.Include(r => r.Items).FirstAsync(r => r.Id == returnId);
        saved.Status.ShouldBe(ReturnStatus.Completed);
        saved.StockRestoredAtUtc.ShouldNotBeNull();
        saved.TotalReturnAmount.ShouldBe(60m); // 3 x 20
        await _outbox.Received(1).AddAsync(
            Arg.Is<FSH.Modules.Sales.Contracts.Events.ReturnCompletedIntegrationEvent>(e => e.MoneyRefundedSeparately),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_Should_Pay_The_Money_Back_Through_A_Linked_Refund_With_A_Credit_Note()
    {
        var sale = await SeedCompletedSaleAsync(quantity: 10m, unitPrice: 20m);
        var command = new CreateReturnCommand(
            sale.Id, sale.CustomerId, DateTime.UtcNow,
            [new ReturnItemInput(sale.Items[0].Id, 3m, "Wrong item", "sealed")],
            Status: "completed", RefundMethod: "cash");

        var returnId = await _sut.Handle(command, CancellationToken.None);

        var payout = await _db.SaleRefunds.Include(r => r.Items).SingleAsync(r => r.ReturnId == returnId);
        payout.Status.ShouldBe(RefundStatus.Completed);
        payout.NetRefundAmount.ShouldBe(60m);
        payout.RefundMethod.ShouldBe("cash");
        payout.CreditNoteNumber.ShouldNotBeNullOrWhiteSpace();
        payout.AccountingPostedAtUtc.ShouldNotBeNull();
        await _outbox.Received(1).AddAsync(
            Arg.Is<FSH.Modules.Sales.Contracts.Events.RefundCompletedIntegrationEvent>(e => e.RefundId == payout.Id && e.NetRefundAmount == 60m),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_Should_Pay_Back_What_The_Customer_Paid_After_The_Line_Discount()
    {
        // 4 units at Rs 25 with a Rs 20 line discount: the customer paid 80, i.e. 20 a unit.
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), Guid.CreateVersion7(), null, null);
        sale.AddItem(Guid.CreateVersion7(), 4m, 25m, 20m, 0m, 10m);
        sale.Finalize("Cash", sale.TotalAmount);
        _db.Sales.Add(sale);
        await _db.SaveChangesAsync(CancellationToken.None);

        var returnId = await _sut.Handle(
            new CreateReturnCommand(sale.Id, sale.CustomerId, DateTime.UtcNow, [new ReturnItemInput(sale.Items[0].Id, 1m, "Changed mind")]),
            CancellationToken.None);

        var saved = await _db.SaleReturns.Include(r => r.Items).FirstAsync(r => r.Id == returnId);
        saved.TotalReturnAmount.ShouldBe(20m);
    }

    [Fact]
    public async Task Handle_Should_Not_Restock_An_Opened_Pack()
    {
        var sale = await SeedCompletedSaleAsync();
        var command = new CreateReturnCommand(
            sale.Id, sale.CustomerId, DateTime.UtcNow,
            [new ReturnItemInput(sale.Items[0].Id, 1m, "Opened", "opened")],
            Status: "completed");

        await _sut.Handle(command, CancellationToken.None);

        await _outbox.Received(1).AddAsync(
            Arg.Is<FSH.Modules.Sales.Contracts.Events.ReturnCompletedIntegrationEvent>(e => e.Lines.All(l => !l.Restock)),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_Should_Throw_When_The_Units_Were_Already_Refunded()
    {
        // A money-only refund already paid back 8 of the 10 units; returning 3 more would pay for 11.
        var sale = await SeedCompletedSaleAsync(quantity: 10m, unitPrice: 20m);
        var saleItem = sale.Items[0];
        var refund = SaleRefund.Create(Guid.CreateVersion7(), sale.Id, null, DateTime.UtcNow, RefundStatus.Completed, "Overcharged", "partial_refund", "cash", 0m, null);
        refund.AddItem(saleItem.Id, saleItem.MedicineId, 8m, 20m);
        _db.SaleRefunds.Add(refund);
        await _db.SaveChangesAsync(CancellationToken.None);

        var command = new CreateReturnCommand(
            sale.Id, sale.CustomerId, DateTime.UtcNow, [new ReturnItemInput(saleItem.Id, 3m, "Back")]);

        var ex = await Should.ThrowAsync<CustomException>(() => _sut.Handle(command, CancellationToken.None).AsTask());
        ex.Message.ShouldContain("already refunded");
    }

    [Fact]
    public async Task Handle_Should_NotRestoreStock_When_StatusPending()
    {
        // Arrange
        var sale = await SeedCompletedSaleAsync();
        var saleItem = sale.Items[0];
        var command = new CreateReturnCommand(
            sale.Id, sale.CustomerId, DateTime.UtcNow,
            [new ReturnItemInput(saleItem.Id, 2m, "Wrong item")],
            Status: "pending");

        // Act
        var returnId = await _sut.Handle(command, CancellationToken.None);

        // Assert
        var saved = await _db.SaleReturns.FirstAsync(r => r.Id == returnId);
        saved.StockRestoredAtUtc.ShouldBeNull();
        await _outbox.DidNotReceive().AddAsync(Arg.Any<FSH.Modules.Sales.Contracts.Events.ReturnCompletedIntegrationEvent>(), Arg.Any<CancellationToken>());
    }

    #endregion

    #region Guards

    [Fact]
    public async Task Handle_Should_Throw_When_SaleNotFound()
    {
        // Arrange
        var command = new CreateReturnCommand(
            Guid.CreateVersion7(), null, DateTime.UtcNow,
            [new ReturnItemInput(Guid.CreateVersion7(), 1m, "x")]);

        // Act & Assert
        await Should.ThrowAsync<NotFoundException>(() => _sut.Handle(command, CancellationToken.None).AsTask());
    }

    [Fact]
    public async Task Handle_Should_Throw_When_QuantityExceedsSaleItemQuantity()
    {
        // Arrange — sold 10, try to return 11 in one shot.
        var sale = await SeedCompletedSaleAsync(quantity: 10m);
        var saleItem = sale.Items[0];
        var command = new CreateReturnCommand(
            sale.Id, sale.CustomerId, DateTime.UtcNow,
            [new ReturnItemInput(saleItem.Id, 11m, "Too many")]);

        // Act & Assert
        await Should.ThrowAsync<CustomException>(() => _sut.Handle(command, CancellationToken.None).AsTask());
    }

    [Fact]
    public async Task Handle_Should_Throw_When_CumulativeReturnsAcrossRequests_ExceedSoldQuantity()
    {
        // Arrange — sold 10; first return takes 7 (non-rejected), second tries 4 more (11 total).
        var sale = await SeedCompletedSaleAsync(quantity: 10m);
        var saleItem = sale.Items[0];
        await _sut.Handle(
            new CreateReturnCommand(sale.Id, sale.CustomerId, DateTime.UtcNow, [new ReturnItemInput(saleItem.Id, 7m, "first")]),
            CancellationToken.None);

        var second = new CreateReturnCommand(
            sale.Id, sale.CustomerId, DateTime.UtcNow, [new ReturnItemInput(saleItem.Id, 4m, "second")]);

        // Act & Assert
        var ex = await Should.ThrowAsync<CustomException>(() => _sut.Handle(second, CancellationToken.None).AsTask());
        ex.Message.ShouldContain("already returned");
    }

    [Fact]
    public async Task Handle_Should_Allow_ReturnAfterRejectedReturn_ForSameQuantity()
    {
        // Arrange — a rejected return does not consume the cap (scripts/68: sum excludes status='rejected').
        var sale = await SeedCompletedSaleAsync(quantity: 10m);
        var saleItem = sale.Items[0];
        var rejectedId = await _sut.Handle(
            new CreateReturnCommand(
                sale.Id, sale.CustomerId, DateTime.UtcNow, [new ReturnItemInput(saleItem.Id, 10m, "first")], Status: "rejected"),
            CancellationToken.None);
        rejectedId.ShouldNotBe(Guid.Empty);

        var second = new CreateReturnCommand(
            sale.Id, sale.CustomerId, DateTime.UtcNow, [new ReturnItemInput(saleItem.Id, 10m, "second")]);

        // Act
        var secondId = await _sut.Handle(second, CancellationToken.None);

        // Assert
        secondId.ShouldNotBe(Guid.Empty);
    }

    [Fact]
    public async Task A_Sale_With_A_Return_Should_Not_Be_Cancelled()
    {
        // Cancelling restocks and reverses the whole sale; the 3 units already returned would come back twice.
        var sale = await SeedCompletedSaleAsync(quantity: 10m);
        await _sut.Handle(
            new CreateReturnCommand(sale.Id, sale.CustomerId, DateTime.UtcNow, [new ReturnItemInput(sale.Items[0].Id, 3m, "Back")]),
            CancellationToken.None);

        var cancel = new FSH.Modules.Sales.Features.v1.Sales.CancelSale.CancelSaleCommandHandler(_db, _outbox, _currentUser);
        var ex = await Should.ThrowAsync<CustomException>(() =>
            cancel.Handle(new FSH.Modules.Sales.Contracts.v1.Sales.CancelSaleCommand(sale.Id, "Mistake"), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
        (await _db.Sales.FirstAsync(s => s.Id == sale.Id)).Status.ShouldBe(SaleStatus.Completed);
    }

    #endregion

    public void Dispose() => _db.Dispose();
}
