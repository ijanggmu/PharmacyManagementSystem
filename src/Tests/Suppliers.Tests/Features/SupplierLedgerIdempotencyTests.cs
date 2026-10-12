using FSH.Modules.Inventory.Contracts.Events;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.IntegrationEventHandlers;
using FSH.Modules.Suppliers.Services;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Suppliers.Tests.Features;

public sealed class SupplierLedgerIdempotencyTests
{
    private readonly SuppliersDbContext _dbContext = SuppliersDbContextFactory.Create();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();

    [Fact]
    public async Task Redelivered_ConsignmentSettled_Should_Post_The_Purchase_Once()
    {
        var supplier = Supplier.Create("Acme Pharma", null, null, null, null, null, 0m);
        _dbContext.Suppliers.Add(supplier);
        await _dbContext.SaveChangesAsync();
        var sut = new ConsignmentSettledIntegrationEventHandler(new SupplierLedgerService(_dbContext, _currentBranch), _dbContext);
        var @event = new ConsignmentSettledIntegrationEvent(
            Guid.CreateVersion7(), DateTime.UtcNow, "test-tenant", Guid.CreateVersion7().ToString(), "Inventory",
            SettlementId: Guid.CreateVersion7(), SupplierId: supplier.Id, TotalAmount: 250m,
            SettlementDateUtc: DateTime.UtcNow, BranchId: null);

        await sut.HandleAsync(@event);
        await sut.HandleAsync(@event);

        (await _dbContext.SupplierLedgerEntries.CountAsync(e => e.SupplierId == supplier.Id)).ShouldBe(1);
        supplier.CurrentBalance.ShouldBe(250m);
    }
}
