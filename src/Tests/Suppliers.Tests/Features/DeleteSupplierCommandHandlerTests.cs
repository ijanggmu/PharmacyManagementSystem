using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Persistence;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.Events;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Features.v1.Suppliers.DeleteSupplier;
using FSH.Modules.Suppliers.IntegrationEventHandlers;
using FSH.Modules.Suppliers.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Suppliers.Tests.Features;

public sealed class DeleteSupplierCommandHandlerTests
{
    private readonly SuppliersDbContext _dbContext = SuppliersDbContextFactory.Create();
    private readonly IMediator _mediator = Substitute.For<IMediator>();

    private async Task<Supplier> SeedAsync()
    {
        var supplier = Supplier.Create("Himal Pharma", null, null, null, null, null, 0m);
        _dbContext.Suppliers.Add(supplier);
        await _dbContext.SaveChangesAsync();
        return supplier;
    }

#pragma warning disable CA2012 // NSubstitute stub set-up, not a consumed ValueTask
    private void StubActivity(int open, int received) =>
        _mediator.Send(Arg.Any<GetSupplierPurchasingActivityQuery>(), Arg.Any<CancellationToken>())
            .Returns(new SupplierPurchasingActivityDto(open, received));
#pragma warning restore CA2012

    [Theory]
    [InlineData(1, 0)]
    [InlineData(0, 1)]
    public async Task Delete_Should_Be_Refused_While_Purchasing_Has_Open_Or_Received_Documents(int open, int received)
    {
        var supplier = await SeedAsync();
        StubActivity(open, received);

        var ex = await Should.ThrowAsync<CustomException>(() => new DeleteSupplierCommandHandler(_dbContext, _mediator)
            .Handle(new DeleteSupplierCommand(supplier.Id), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await _dbContext.Suppliers.CountAsync()).ShouldBe(1);
    }

    [Fact]
    public async Task Delete_Should_Succeed_Without_Purchasing_Activity()
    {
        var supplier = await SeedAsync();
        StubActivity(0, 0);

        await new DeleteSupplierCommandHandler(_dbContext, _mediator)
            .Handle(new DeleteSupplierCommand(supplier.Id), CancellationToken.None);

        (await _dbContext.Suppliers.CountAsync()).ShouldBe(0);
    }

    [Fact]
    public async Task A_Posting_For_A_Just_Deleted_Supplier_Should_Still_Land()
    {
        var supplier = await SeedAsync();
        _dbContext.Entry(supplier).Property(s => s.IsDeleted).CurrentValue = true;
        await _dbContext.SaveChangesAsync();
        _dbContext.ChangeTracker.Clear();

        var sut = new PurchaseOrderReceivedIntegrationEventHandler(_dbContext, Substitute.For<ICurrentBranch>());
        await sut.HandleAsync(new PurchaseOrderReceivedIntegrationEvent(
            Guid.CreateVersion7(), DateTime.UtcNow, "test-tenant", "corr", "Purchasing",
            PurchaseOrderId: Guid.CreateVersion7(), SupplierId: supplier.Id, OrderDateUtc: DateTime.UtcNow,
            TotalAmount: 100m));

        var posted = await _dbContext.Suppliers.IgnoreQueryFilters([QueryFilters.SoftDelete]).SingleAsync();
        posted.CurrentBalance.ShouldBe(100m);
    }

    [Fact]
    public async Task A_Zero_Value_Purchase_Order_Should_Post_Nothing()
    {
        var supplier = await SeedAsync();

        var sut = new PurchaseOrderReceivedIntegrationEventHandler(_dbContext, Substitute.For<ICurrentBranch>());
        await sut.HandleAsync(new PurchaseOrderReceivedIntegrationEvent(
            Guid.CreateVersion7(), DateTime.UtcNow, "test-tenant", "corr", "Purchasing",
            PurchaseOrderId: Guid.CreateVersion7(), SupplierId: supplier.Id, OrderDateUtc: DateTime.UtcNow,
            TotalAmount: 0m));

        (await _dbContext.SupplierLedgerEntries.CountAsync()).ShouldBe(0);
    }
}
