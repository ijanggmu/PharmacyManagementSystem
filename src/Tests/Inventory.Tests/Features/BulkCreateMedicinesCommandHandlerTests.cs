using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Events;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Features.v1.Medicines.BulkCreateMedicines;
using FSH.Modules.Multitenancy.Contracts;
using NSubstitute;

namespace Inventory.Tests.Features;

public sealed class BulkCreateMedicinesCommandHandlerTests
{
    private static BulkCreateMedicinesCommandHandler CreateHandler(
        FSH.Modules.Inventory.Data.InventoryDbContext db, IOutboxWriter? outbox = null, Guid? branchId = null)
    {
        var currentBranch = Substitute.For<ICurrentBranch>();
        currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(branchId ?? Guid.CreateVersion7());
        return new BulkCreateMedicinesCommandHandler(
            db,
            currentBranch,
            outbox ?? Substitute.For<IOutboxWriter>(),
            Substitute.For<FSH.Framework.Core.Context.ICurrentUser>());
    }

    private static List<IIntegrationEvent> CaptureEvents(IOutboxWriter outbox)
    {
        var events = new List<IIntegrationEvent>();
        outbox.AddAsync(Arg.Do<IIntegrationEvent>(events.Add), Arg.Any<CancellationToken>()).Returns(Task.CompletedTask);
        return events;
    }

    [Fact]
    public async Task Handle_Should_PublishOneBillWithAllLines_When_RowsShareSupplierInvoiceAndDate()
    {
        using var db = InventoryDbContextFactory.Create();
        var outbox = Substitute.For<IOutboxWriter>();
        var events = CaptureEvents(outbox);
        var branchId = Guid.CreateVersion7();
        var supplierId = Guid.CreateVersion7();
        var billDate = new DateOnly(2026, 9, 15);
        var handler = CreateHandler(db, outbox, branchId);

        await handler.Handle(new BulkCreateMedicinesCommand(
        [
            new BulkMedicineRow("Paracetamol", Quantity: 10m, CostPrice: 2m, SupplierId: supplierId,
                SupplierInvoiceNumber: "INV-1", VatAmount: 2.6m, ReceiptDate: billDate),
            new BulkMedicineRow("Amoxicillin", Quantity: 5m, CostPrice: 4m, SupplierId: supplierId,
                SupplierInvoiceNumber: " INV-1 ", VatAmount: 2.6m, ReceiptDate: billDate),
        ]), CancellationToken.None);

        var bill = events.OfType<MedicineStockReceivedFromSupplierIntegrationEvent>().ShouldHaveSingleItem();
        bill.SupplierId.ShouldBe(supplierId);
        bill.SupplierInvoiceNumber.ShouldBe("INV-1");
        bill.ReceiptDateUtc.ShouldBe(new DateTime(2026, 9, 15, 0, 0, 0, DateTimeKind.Utc));
        bill.BranchId.ShouldBe(branchId);
        bill.Lines.ShouldNotBeNull().Count.ShouldBe(2);
        bill.VatAmount.ShouldBe(5.2m);
        bill.GrossAmount.ShouldBe(10m * 2m + 5m * 4m + 5.2m);
        events.OfType<OpeningStockReceivedIntegrationEvent>().ShouldBeEmpty();
    }

    [Fact]
    public async Task Handle_Should_Carry_The_Bills_PaidAtEntry_Payment()
    {
        using var db = InventoryDbContextFactory.Create();
        var outbox = Substitute.For<IOutboxWriter>();
        var events = CaptureEvents(outbox);
        var supplierId = Guid.CreateVersion7();
        var handler = CreateHandler(db, outbox);

        await handler.Handle(new BulkCreateMedicinesCommand(
        [
            new BulkMedicineRow("Paracetamol", Quantity: 10m, CostPrice: 2m, SupplierId: supplierId,
                SupplierInvoiceNumber: "INV-9", Payment: new SupplierBillPayment("cash")),
            new BulkMedicineRow("Amoxicillin", Quantity: 5m, CostPrice: 4m, SupplierId: supplierId,
                SupplierInvoiceNumber: "INV-9"),
        ]), CancellationToken.None);

        var bill = events.OfType<MedicineStockReceivedFromSupplierIntegrationEvent>().ShouldHaveSingleItem();
        bill.Payment.ShouldNotBeNull().Method.ShouldBe("cash");
    }

    [Fact]
    public void Validator_Should_Reject_Payment_More_Than_The_Bill()
    {
        var supplierId = Guid.CreateVersion7();
        var result = new BulkCreateMedicinesCommandValidator().Validate(new BulkCreateMedicinesCommand(
        [
            new BulkMedicineRow("Paracetamol", Quantity: 10m, CostPrice: 2m, SupplierId: supplierId,
                SupplierInvoiceNumber: "INV-9", Payment: new SupplierBillPayment("cash", 50m)),
        ]));

        result.IsValid.ShouldBeFalse();
    }

    [Fact]
    public void Validator_Should_Reject_Unknown_Payment_Method()
    {
        var result = new BulkCreateMedicinesCommandValidator().Validate(new BulkCreateMedicinesCommand(
        [
            new BulkMedicineRow("Paracetamol", Quantity: 10m, CostPrice: 2m, SupplierId: Guid.CreateVersion7(),
                Payment: new SupplierBillPayment("barter")),
        ]));

        result.IsValid.ShouldBeFalse();
    }

    [Fact]
    public async Task Handle_Should_PublishSeparateBills_When_SupplierRowsHaveNoInvoiceNumber()
    {
        using var db = InventoryDbContextFactory.Create();
        var outbox = Substitute.For<IOutboxWriter>();
        var events = CaptureEvents(outbox);
        var supplierId = Guid.CreateVersion7();
        var handler = CreateHandler(db, outbox);

        await handler.Handle(new BulkCreateMedicinesCommand(
        [
            new BulkMedicineRow("Paracetamol", Quantity: 10m, CostPrice: 2m, SupplierId: supplierId),
            new BulkMedicineRow("Amoxicillin", Quantity: 5m, CostPrice: 4m, SupplierId: supplierId),
        ]), CancellationToken.None);

        events.OfType<MedicineStockReceivedFromSupplierIntegrationEvent>().Count().ShouldBe(2);
    }

    [Fact]
    public async Task Handle_Should_PublishOneOpeningStockEntry_When_RowsHaveNoSupplier()
    {
        using var db = InventoryDbContextFactory.Create();
        var outbox = Substitute.For<IOutboxWriter>();
        var events = CaptureEvents(outbox);
        var handler = CreateHandler(db, outbox);

        await handler.Handle(new BulkCreateMedicinesCommand(
        [
            new BulkMedicineRow("Paracetamol", Quantity: 10m, CostPrice: 2m),
            new BulkMedicineRow("Amoxicillin", Quantity: 5m, CostPrice: 4m),
            new BulkMedicineRow("Cetirizine"),
        ]), CancellationToken.None);

        var opening = events.OfType<OpeningStockReceivedIntegrationEvent>().ShouldHaveSingleItem();
        opening.Amount.ShouldBe(40m);
        events.OfType<MedicineStockReceivedFromSupplierIntegrationEvent>().ShouldBeEmpty();
    }

    [Fact]
    public async Task Handle_Should_CreateAllMedicines_When_NoInitialStock()
    {
        using var db = InventoryDbContextFactory.Create();
        var handler = CreateHandler(db);

        var command = new BulkCreateMedicinesCommand(
        [
            new BulkMedicineRow("Paracetamol"),
            new BulkMedicineRow("Amoxicillin", "amoxicillin"),
        ]);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Created.Count.ShouldBe(2);
        result.Created.ShouldAllBe(c => c.BatchId == null);
        db.Medicines.Count().ShouldBe(2);
        db.MedicineBatches.Count().ShouldBe(0);
    }

    [Fact]
    public async Task Handle_Should_CreateBatchAndLedgerEntry_When_RowHasInitialStock()
    {
        using var db = InventoryDbContextFactory.Create();
        var handler = CreateHandler(db);

        var command = new BulkCreateMedicinesCommand(
        [
            new BulkMedicineRow(
                "Paracetamol", BatchNo: "B100", ExpiryDate: DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)),
                Quantity: 50m, CostPrice: 2m, SellingPrice: 3m),
        ]);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Created.Count.ShouldBe(1);
        result.Created[0].BatchId.ShouldNotBeNull();

        var batch = db.MedicineBatches.Single();
        batch.MedicineId.ShouldBe(result.Created[0].MedicineId);
        batch.QuantityOnHand.ShouldBe(50m);
        batch.BatchNo.ShouldBe("B100");

        db.InventoryTransactions.Count().ShouldBe(1);
    }

    [Fact]
    public async Task Handle_Should_GenerateBatchNo_When_NotProvided()
    {
        using var db = InventoryDbContextFactory.Create();
        var handler = CreateHandler(db);

        var command = new BulkCreateMedicinesCommand(
        [
            new BulkMedicineRow("Paracetamol", Quantity: 10m),
        ]);

        await handler.Handle(command, CancellationToken.None);

        var batch = db.MedicineBatches.Single();
        batch.BatchNo.ShouldStartWith("AUTO-");
    }

    [Fact]
    public async Task Handle_Should_PersistNothing_When_ARowIsInvalid()
    {
        using var db = InventoryDbContextFactory.Create();
        var handler = CreateHandler(db);

        var command = new BulkCreateMedicinesCommand(
        [
            new BulkMedicineRow("Paracetamol"),
            new BulkMedicineRow(string.Empty), // invalid: Medicine.Create rejects a blank name
        ]);

        await Should.ThrowAsync<ArgumentException>(() => handler.Handle(command, CancellationToken.None).AsTask());

        // Nothing was saved — the loop threw before SaveChangesAsync was ever reached.
        db.Medicines.Count().ShouldBe(0);
    }
}
