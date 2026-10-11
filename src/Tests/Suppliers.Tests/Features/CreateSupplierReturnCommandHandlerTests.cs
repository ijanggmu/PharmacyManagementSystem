using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Reference.Contracts.Dtos;
using FSH.Modules.Reference.Contracts.v1.Settings;
using FSH.Modules.Suppliers.Contracts.Events;
using FSH.Modules.Suppliers.Contracts.v1.Returns;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Features.v1.Returns.CreateSupplierReturn;
using FSH.Modules.Suppliers.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Suppliers.Tests.Features;

/// <summary>A supplier return is a numbered debit note: stock out of the right lot, payable down by cost + VAT.</summary>
public sealed class CreateSupplierReturnCommandHandlerTests
{
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly IStockDeductionService _stockDeductionService = Substitute.For<IStockDeductionService>();
    private readonly ISupplierDebitNoteNumberService _numbers = Substitute.For<ISupplierDebitNoteNumberService>();
    private readonly SuppliersDbContext _dbContext;
    private readonly CreateSupplierReturnCommandHandler _sut;
    private readonly Guid _branchId = Guid.CreateVersion7();

    public CreateSupplierReturnCommandHandlerTests()
    {
        _dbContext = SuppliersDbContextFactory.Create();
        _sut = new CreateSupplierReturnCommandHandler(_dbContext, _stockDeductionService, _mediator, _outbox, _currentUser, _currentBranch, _numbers);

        _currentUser.GetTenant().Returns("test-tenant");
        _currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
        _numbers.ResolveBranchCodeAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>()).Returns("MAIN");
        _numbers.ReserveNextAsync(Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>()).Returns(12);
        _mediator.Send(Arg.Any<GetSupplierReceivedQuantityQuery>(), Arg.Any<CancellationToken>()).Returns(0m);
        _mediator.Send(Arg.Any<GetPharmacySettingsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new PharmacySettingsDto(Guid.CreateVersion7(), "Test Pharmacy", null, null, null, "NPR", 13m, "INV", 1, null));
        _stockDeductionService.DeductForSupplierReturnAsync(Arg.Any<StockDeductionRequest>(), Arg.Any<CancellationToken>())
            .Returns(ci => ci.Arg<StockDeductionRequest>().Lines
                .Select(l => new StockDeductionLineResult(l.MedicineId, l.Quantity,
                    [new BatchDeductionDetail(l.BatchId ?? Guid.CreateVersion7(), "EXP-2401", l.Quantity, 10m)]))
                .ToList());
    }

    private Guid StubMedicine(bool isTaxable = true)
    {
        var id = Guid.CreateVersion7();
        _mediator.Send(Arg.Is<GetMedicineByIdQuery>(q => q.MedicineId == id), Arg.Any<CancellationToken>())
            .Returns(new MedicineDto(
                Id: id, Name: "Cetamol", GenericName: null, CategoryId: null, ReorderLevel: 0m, IsControlled: false,
                TotalQuantityOnHand: 100m, IsArchived: false, CreatedAtUtc: DateTime.UtcNow, UpdatedAtUtc: null,
                UnitPrice: 15m, Strength: "500mg", IsTaxable: isTaxable));
        return id;
    }

    private async Task<Supplier> SeedSupplierAsync()
    {
        var supplier = Supplier.Create("Acme Pharma", null, null, null, null, null, 0m);
        _dbContext.Suppliers.Add(supplier);
        await _dbContext.SaveChangesAsync();
        return supplier;
    }

    [Fact]
    public async Task Return_Should_Be_A_Numbered_Debit_Note_On_The_Branch()
    {
        var supplier = await SeedSupplierAsync();
        var medicineId = StubMedicine();

        var returnId = await _sut.Handle(
            new CreateSupplierReturnCommand(supplier.Id, new DateTime(2026, 10, 11, 0, 0, 0, DateTimeKind.Utc), "Expired stock",
                [new SupplierReturnItemInput(medicineId, 5m, 10m, "Expired")], SupplierInvoiceNumber: "BILL-77"),
            CancellationToken.None);

        var saved = await _dbContext.SupplierReturns.Include(r => r.Items).AsNoTracking().FirstAsync(r => r.Id == returnId);
        saved.BranchId.ShouldBe(_branchId);
        saved.DocumentNumber.ShouldBe("DN-MAIN-2083/84-00012");
        saved.SupplierInvoiceNumber.ShouldBe("BILL-77");
        saved.Items[0].MedicineName.ShouldBe("Cetamol 500mg");
        saved.Items[0].BatchNo.ShouldBe("EXP-2401");

        var ledger = await _dbContext.SupplierLedgerEntries.AsNoTracking().FirstAsync(e => e.SupplierId == supplier.Id);
        ledger.BranchId.ShouldBe(_branchId);
        ledger.EntryType.ShouldBe(SupplierLedgerEntryType.Return);
        ledger.DocumentNumber.ShouldBe("DN-MAIN-2083/84-00012");
    }

    [Fact]
    public async Task Taxable_Lines_Should_Reverse_Input_VAT_And_Credit_Cost_Plus_VAT()
    {
        var supplier = await SeedSupplierAsync();
        var taxable = StubMedicine(isTaxable: true);
        var exempt = StubMedicine(isTaxable: false);

        await _sut.Handle(
            new CreateSupplierReturnCommand(supplier.Id, DateTime.UtcNow, null,
            [
                new SupplierReturnItemInput(taxable, 10m, 10m, "Expired"),   // lot cost 10: 100 + 13 VAT
                new SupplierReturnItemInput(exempt, 5m, 10m, "Damaged"),     // lot cost 10: 50, no VAT
            ]),
            CancellationToken.None);

        var ledger = await _dbContext.SupplierLedgerEntries.AsNoTracking().FirstAsync(e => e.SupplierId == supplier.Id);
        ledger.CreditAmount.ShouldBe(163m);
        await _outbox.Received(1).AddAsync(
            Arg.Is<SupplierReturnCreatedIntegrationEvent>(e => e.TotalCost == 150m && e.VatAmount == 13m && e.DocumentNumber != null),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task The_Debit_Note_Should_Be_Valued_At_The_Lot_Cost_Not_The_Client_Unit_Cost()
    {
        var supplier = await SeedSupplierAsync();
        var medicineId = StubMedicine(isTaxable: false);

        // The client sends the selling price (99) by mistake; the lots that leave stock cost 10.
        await _sut.Handle(
            new CreateSupplierReturnCommand(supplier.Id, DateTime.UtcNow, null,
                [new SupplierReturnItemInput(medicineId, 5m, 99m, "Expired")]),
            CancellationToken.None);

        (await _dbContext.SupplierReturnItems.AsNoTracking().SingleAsync()).UnitCost.ShouldBe(10m);
        (await _dbContext.SupplierLedgerEntries.AsNoTracking().SingleAsync()).CreditAmount.ShouldBe(50m);
        await _outbox.Received(1).AddAsync(
            Arg.Is<SupplierReturnCreatedIntegrationEvent>(e => e.TotalCost == 50m), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task A_Line_Spread_Over_Two_Lots_Should_Become_Two_Debit_Note_Lines_At_Each_Lots_Cost()
    {
        var supplier = await SeedSupplierAsync();
        var medicineId = StubMedicine(isTaxable: false);
        var lotA = Guid.CreateVersion7();
        var lotB = Guid.CreateVersion7();
        _stockDeductionService.DeductForSupplierReturnAsync(Arg.Any<StockDeductionRequest>(), Arg.Any<CancellationToken>())
            .Returns(
            [
                new StockDeductionLineResult(medicineId, 5m,
                [
                    new BatchDeductionDetail(lotA, "LOT-A", 2m, 8m),
                    new BatchDeductionDetail(lotB, "LOT-B", 3m, 12m),
                ]),
            ]);

        await _sut.Handle(
            new CreateSupplierReturnCommand(supplier.Id, DateTime.UtcNow, null,
                [new SupplierReturnItemInput(medicineId, 5m, 0m, "Expired")]),
            CancellationToken.None);

        var items = await _dbContext.SupplierReturnItems.AsNoTracking().ToListAsync();
        items.Select(i => (i.BatchId, i.Quantity, i.UnitCost)).ShouldBe([(lotA, 2m, 8m), (lotB, 3m, 12m)], ignoreOrder: true);
        (await _dbContext.SupplierLedgerEntries.AsNoTracking().SingleAsync()).CreditAmount.ShouldBe(52m);
    }

    [Fact]
    public async Task Deduction_Results_Should_Be_Matched_To_Lines_Whatever_Their_Order()
    {
        var supplier = await SeedSupplierAsync();
        var fefoMedicine = StubMedicine(isTaxable: false);
        var pinnedMedicine = StubMedicine(isTaxable: false);
        var pinnedLot = Guid.CreateVersion7();
        // Named lots are deducted first, so their result comes back first.
        _stockDeductionService.DeductForSupplierReturnAsync(Arg.Any<StockDeductionRequest>(), Arg.Any<CancellationToken>())
            .Returns(
            [
                new StockDeductionLineResult(pinnedMedicine, 3m, [new BatchDeductionDetail(pinnedLot, "PIN", 3m, 20m)]),
                new StockDeductionLineResult(fefoMedicine, 2m, [new BatchDeductionDetail(Guid.CreateVersion7(), "FEFO", 2m, 5m)]),
            ]);

        await _sut.Handle(
            new CreateSupplierReturnCommand(supplier.Id, DateTime.UtcNow, null,
            [
                new SupplierReturnItemInput(fefoMedicine, 2m, 0m, "Expired"),
                new SupplierReturnItemInput(pinnedMedicine, 3m, 0m, "Damaged", BatchId: pinnedLot),
            ]),
            CancellationToken.None);

        var items = await _dbContext.SupplierReturnItems.AsNoTracking().ToListAsync();
        items.Single(i => i.MedicineId == pinnedMedicine).BatchNo.ShouldBe("PIN");
        items.Single(i => i.MedicineId == pinnedMedicine).ReturnReason.ShouldBe("Damaged");
        items.Single(i => i.MedicineId == fefoMedicine).BatchNo.ShouldBe("FEFO");
    }

    [Fact]
    public async Task Two_Lines_Of_One_Medicine_Should_Share_One_Received_Allowance()
    {
        var supplier = await SeedSupplierAsync();
        var medicineId = StubMedicine();
        _mediator.Send(Arg.Any<GetSupplierReceivedQuantityQuery>(), Arg.Any<CancellationToken>()).Returns(6m);

        // 4 + 4 = 8 > 6 received, even though each line alone fits.
        var ex = await Should.ThrowAsync<CustomException>(() => _sut.Handle(
            new CreateSupplierReturnCommand(supplier.Id, DateTime.UtcNow, null,
            [
                new SupplierReturnItemInput(medicineId, 4m, 10m, "Expired"),
                new SupplierReturnItemInput(medicineId, 4m, 10m, "Damaged"),
            ]),
            CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        await _stockDeductionService.DidNotReceiveWithAnyArgs().DeductForSupplierReturnAsync(default!, default);
    }

    [Fact]
    public async Task No_VAT_Should_Be_Reversed_When_The_Goods_Came_Without_A_VAT_Bill()
    {
        var supplier = await SeedSupplierAsync();
        var medicineId = StubMedicine();

        await _sut.Handle(
            new CreateSupplierReturnCommand(supplier.Id, DateTime.UtcNow, null,
                [new SupplierReturnItemInput(medicineId, 10m, 10m, "Expired")], ReverseInputVat: false),
            CancellationToken.None);

        (await _dbContext.SupplierLedgerEntries.AsNoTracking().FirstAsync()).CreditAmount.ShouldBe(100m);
    }

    [Fact]
    public async Task A_Named_Batch_Should_Be_Passed_To_The_Stock_Deduction()
    {
        var supplier = await SeedSupplierAsync();
        var medicineId = StubMedicine();
        var batchId = Guid.CreateVersion7();

        await _sut.Handle(
            new CreateSupplierReturnCommand(supplier.Id, DateTime.UtcNow, null,
                [new SupplierReturnItemInput(medicineId, 3m, 10m, "Damaged", BatchId: batchId)]),
            CancellationToken.None);

        await _stockDeductionService.Received(1).DeductForSupplierReturnAsync(
            Arg.Is<StockDeductionRequest>(r => r.Lines.Single().BatchId == batchId), Arg.Any<CancellationToken>());
        (await _dbContext.SupplierReturnItems.AsNoTracking().SingleAsync()).BatchId.ShouldBe(batchId);
    }

    [Fact]
    public async Task Returning_More_Than_Was_Received_Should_Be_Refused()
    {
        var supplier = await SeedSupplierAsync();
        var medicineId = StubMedicine();
        _mediator.Send(Arg.Any<GetSupplierReceivedQuantityQuery>(), Arg.Any<CancellationToken>()).Returns(4m);

        var ex = await Should.ThrowAsync<CustomException>(() => _sut.Handle(
            new CreateSupplierReturnCommand(supplier.Id, DateTime.UtcNow, null,
                [new SupplierReturnItemInput(medicineId, 5m, 10m, "Expired")]),
            CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        _dbContext.SupplierReturns.ShouldBeEmpty();
    }
}
