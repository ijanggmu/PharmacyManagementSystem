using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.v1.Returns;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Returns.CreateReturn;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Sales.Tests.Features.Returns;

public sealed class CreateReturnCommandHandlerTests : IDisposable
{
    private readonly SalesDbContext _db = SalesDbContextFactory.Create();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly CreateReturnCommandHandler _sut;

    public CreateReturnCommandHandlerTests()
    {
        _currentUser.GetTenant().Returns("test-tenant");
        _currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(Guid.CreateVersion7());
        _sut = new CreateReturnCommandHandler(_db, _outbox, _currentUser, _currentBranch);
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
        await _outbox.Received(1).AddAsync(Arg.Any<FSH.Modules.Sales.Contracts.Events.ReturnCompletedIntegrationEvent>(), Arg.Any<CancellationToken>());
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
        ex.Message.ShouldContain("Only 3 more can be returned");
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

    #endregion

    public void Dispose() => _db.Dispose();
}
