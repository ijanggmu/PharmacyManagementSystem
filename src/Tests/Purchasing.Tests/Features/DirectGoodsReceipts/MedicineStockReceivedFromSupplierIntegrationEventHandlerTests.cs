using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Events;
using FSH.Modules.Purchasing.Contracts.Events;
using FSH.Modules.Purchasing.Domain;
using FSH.Modules.Purchasing.IntegrationEventHandlers;
using FSH.Modules.Purchasing.Services;
using NSubstitute;

namespace Purchasing.Tests.Features.DirectGoodsReceipts;

public sealed class MedicineStockReceivedFromSupplierIntegrationEventHandlerTests
{
    private static IReceiptNumberService Numbers()
    {
        var numbers = Substitute.For<IReceiptNumberService>();
        numbers.ResolveBranchCodeAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>()).Returns("MAIN");
        numbers.ReserveNextAsync(Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>()).Returns(1);
        return numbers;
    }

    private static MedicineStockReceivedFromSupplierIntegrationEvent Event(
        IReadOnlyList<SupplierStockReceiptLine>? lines, Guid? branchId) =>
        new(
            Id: Guid.NewGuid(),
            OccurredOnUtc: DateTime.UtcNow,
            TenantId: "test-tenant",
            CorrelationId: "corr",
            Source: "Inventory",
            ReceiptId: Guid.CreateVersion7(),
            MedicineId: Guid.CreateVersion7(),
            SupplierId: Guid.CreateVersion7(),
            GrossAmount: 226m,
            ReceiptDateUtc: new DateTime(2026, 9, 15, 0, 0, 0, DateTimeKind.Utc),
            SupplierInvoiceNumber: "INV-1",
            VatAmount: 26m,
            BranchId: branchId,
            Lines: lines,
            ReceivedBy: "pharmacist");

    [Fact]
    public async Task HandleAsync_Should_RecordReceiptAndPublishPosted_When_EventHasLines()
    {
        using var db = PurchasingDbContextFactory.Create();
        var outbox = Substitute.For<IOutboxWriter>();
        var handler = new MedicineStockReceivedFromSupplierIntegrationEventHandler(db, outbox, Numbers());
        var branchId = Guid.CreateVersion7();
        var medicineA = Guid.CreateVersion7();
        var medicineB = Guid.CreateVersion7();
        var @event = Event(
            [new SupplierStockReceiptLine(medicineA, 10m, 10m, 13m), new SupplierStockReceiptLine(medicineB, 5m, 20m, 13m)],
            branchId);

        await handler.HandleAsync(@event);

        var receipt = db.DirectGoodsReceipts.Single();
        receipt.Id.ShouldBe(@event.ReceiptId);
        receipt.SupplierId.ShouldBe(@event.SupplierId);
        receipt.BranchId.ShouldBe(branchId);
        receipt.SupplierInvoiceNumber.ShouldBe("INV-1");
        receipt.ReceiptDateUtc.ShouldBe(@event.ReceiptDateUtc);
        receipt.Status.ShouldBe(DirectGoodsReceiptStatus.Received);
        receipt.GrossAmount.ShouldBe(226m);
        // Receipt dated 2026-09-15 → fiscal year 2083/84.
        receipt.ReceiptNumber.ShouldBe("GRN-MAIN-2083/84-00001");
        receipt.FiscalYear.ShouldBe(2083);

        await outbox.Received(1).AddAsync(
            Arg.Is<DirectGoodsReceiptPostedIntegrationEvent>(e =>
                e.ReceiptId == @event.ReceiptId && e.GrossAmount == 226m && e.VatAmount == 26m && e.BranchId == branchId),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task HandleAsync_Should_Carry_Numbers_And_PaidAtEntry_On_Posted_Event()
    {
        using var db = PurchasingDbContextFactory.Create();
        var outbox = Substitute.For<IOutboxWriter>();
        var handler = new MedicineStockReceivedFromSupplierIntegrationEventHandler(db, outbox, Numbers());
        // Gross is 10 x 20 + 26 = 226; a 500 payment is capped at the gross.
        var @event = Event([new SupplierStockReceiptLine(Guid.CreateVersion7(), 10m, 20m, 26m)], Guid.CreateVersion7())
            with { Payment = new SupplierBillPayment("bank", 500m, "TXN-1") };

        await handler.HandleAsync(@event);

        await outbox.Received(1).AddAsync(
            Arg.Is<DirectGoodsReceiptPostedIntegrationEvent>(e =>
                e.ReceiptNumber == "GRN-MAIN-2083/84-00001"
                && e.SupplierInvoiceNumber == "INV-1"
                && e.Payment != null
                && e.Payment.Method == "bank"
                && e.Payment.Amount == 226m
                && e.Payment.Reference == "TXN-1"
                && e.Payment.PaymentDateUtc == @event.ReceiptDateUtc),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task HandleAsync_Should_NotDuplicate_When_ReceiptAlreadyRecorded()
    {
        using var db = PurchasingDbContextFactory.Create();
        var outbox = Substitute.For<IOutboxWriter>();
        var handler = new MedicineStockReceivedFromSupplierIntegrationEventHandler(db, outbox, Numbers());
        var @event = Event([new SupplierStockReceiptLine(Guid.CreateVersion7(), 10m, 20m, 26m)], Guid.CreateVersion7());

        await handler.HandleAsync(@event);
        await handler.HandleAsync(@event);

        db.DirectGoodsReceipts.Count().ShouldBe(1);
        await outbox.Received(1).AddAsync(Arg.Any<DirectGoodsReceiptPostedIntegrationEvent>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task HandleAsync_Should_Ignore_LegacyEventWithoutLines()
    {
        using var db = PurchasingDbContextFactory.Create();
        var outbox = Substitute.For<IOutboxWriter>();
        var handler = new MedicineStockReceivedFromSupplierIntegrationEventHandler(db, outbox, Numbers());

        await handler.HandleAsync(Event(lines: null, branchId: Guid.CreateVersion7()));

        db.DirectGoodsReceipts.Count().ShouldBe(0);
        await outbox.DidNotReceiveWithAnyArgs().AddAsync(default!, default);
    }
}
