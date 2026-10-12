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

        // By default every line leaves at Rs 4 a unit, one batch per line.
        // NSubstitute's Returns() consumes the ValueTask configured here; CA2012 does not apply to a stub setup.
#pragma warning disable CA2012
        _stockDeductionService
            .DeductForSupplierReturnAsync(Arg.Any<StockDeductionRequest>(), Arg.Any<CancellationToken>())
            .Returns(call => new ValueTask<IReadOnlyList<StockDeductionLineResult>>(
                call.Arg<StockDeductionRequest>().Lines
                    .Select(l => new StockDeductionLineResult(l.MedicineId, l.Quantity,
                        [new BatchDeductionDetail(l.BatchId ?? Guid.CreateVersion7(), "LOT", l.Quantity, 4m)]))
                    .ToList()));
#pragma warning restore CA2012
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

    [Fact]
    public async Task Handle_Should_Value_The_Return_At_What_The_Stock_Cost_Not_The_Typed_Cost()
    {
        // The user typed Rs 120 a unit; the 3 units that left came from two batches costing 80 and 90.
        var supplier = await SeedSupplierAsync();
        var medicineId = Guid.CreateVersion7();
        var recalledLot = Guid.CreateVersion7();
#pragma warning disable CA2012 // stub setup, see constructor
        _stockDeductionService
            .DeductForSupplierReturnAsync(Arg.Any<StockDeductionRequest>(), Arg.Any<CancellationToken>())
            .Returns(new ValueTask<IReadOnlyList<StockDeductionLineResult>>(new List<StockDeductionLineResult>
            {
                new(medicineId, 3m, [new BatchDeductionDetail(recalledLot, "A", 2m, 80m), new BatchDeductionDetail(Guid.CreateVersion7(), "B", 1m, 90m)]),
            }));
#pragma warning restore CA2012

        var returnId = await _sut.Handle(
            new CreateSupplierReturnCommand(
                supplier.Id, DateTime.UtcNow, "Recall",
                [new SupplierReturnItemInput(medicineId, 3m, 120m, "Recalled", BatchId: recalledLot)]),
            CancellationToken.None);

        var item = await _dbContext.SupplierReturnItems.AsNoTracking().SingleAsync(i => i.SupplierReturnId == returnId);
        item.UnitCost.ShouldBe(83.33m); // (2 x 80 + 1 x 90) / 3
        // The supplier is credited 3 x 83.33 (the line is stored per unit, at 2 dp).
        (await _dbContext.Suppliers.AsNoTracking().SingleAsync(x => x.Id == supplier.Id)).CurrentBalance.ShouldBe(-249.99m);
        await _stockDeductionService.Received(1).DeductForSupplierReturnAsync(
            Arg.Is<StockDeductionRequest>(r => r.Lines.Single().BatchId == recalledLot), Arg.Any<CancellationToken>());
    }
}
