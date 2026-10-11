using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Suppliers.Contracts.v1.Returns;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Features.v1.Returns.CreateSupplierReturn;
using Mediator;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Suppliers.Tests.Features;

public sealed class CreateSupplierReturnCommandHandlerTests
{
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly IStockDeductionService _stockDeductionService = Substitute.For<IStockDeductionService>();
    private readonly SuppliersDbContext _dbContext;
    private readonly CreateSupplierReturnCommandHandler _sut;

    public CreateSupplierReturnCommandHandlerTests()
    {
        _dbContext = SuppliersDbContextFactory.Create();
        _sut = new CreateSupplierReturnCommandHandler(_dbContext, _stockDeductionService, _mediator, _outbox, _currentUser, _currentBranch);

        _mediator.Send(Arg.Any<GetSupplierReceivedQuantityQuery>(), Arg.Any<CancellationToken>())
            .Returns(0m);
        _currentUser.GetTenant().Returns("test-tenant");
    }

    private async Task<Supplier> SeedSupplierAsync()
    {
        var supplier = Supplier.Create("Acme Pharma", null, null, null, null, null, 0m);
        _dbContext.Suppliers.Add(supplier);
        await _dbContext.SaveChangesAsync();
        return supplier;
    }

    [Fact]
    public async Task Handle_Should_StampBranchId_OnReturnAndLedgerEntry()
    {
        var supplier = await SeedSupplierAsync();
        var branchId = Guid.CreateVersion7();
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(branchId);

        var medicineId = Guid.CreateVersion7();
        var returnId = await _sut.Handle(
            new CreateSupplierReturnCommand(
                supplier.Id, DateTime.UtcNow, "Expired stock",
                [new SupplierReturnItemInput(medicineId, 5m, 10m, "Expired")]),
            CancellationToken.None);

        var supplierReturn = await _dbContext.SupplierReturns.AsNoTracking().FirstAsync(r => r.Id == returnId);
        supplierReturn.BranchId.ShouldBe(branchId);

        var ledgerEntry = await _dbContext.SupplierLedgerEntries.AsNoTracking().FirstAsync(e => e.SupplierId == supplier.Id);
        ledgerEntry.BranchId.ShouldBe(branchId);
        ledgerEntry.EntryType.ShouldBe(SupplierLedgerEntryType.Return);
    }

    [Fact]
    public async Task Handle_Should_PersistNullBranchId_When_ICurrentBranchReturnsNull()
    {
        var supplier = await SeedSupplierAsync();
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns((Guid?)null);

        var medicineId = Guid.CreateVersion7();
        var returnId = await _sut.Handle(
            new CreateSupplierReturnCommand(
                supplier.Id, DateTime.UtcNow, null,
                [new SupplierReturnItemInput(medicineId, 2m, 5m, "Damaged")]),
            CancellationToken.None);

        var supplierReturn = await _dbContext.SupplierReturns.AsNoTracking().FirstAsync(r => r.Id == returnId);
        supplierReturn.BranchId.ShouldBeNull();
    }
}
