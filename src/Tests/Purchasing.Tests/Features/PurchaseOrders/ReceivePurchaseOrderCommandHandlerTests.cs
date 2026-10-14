using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.Events;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using FSH.Modules.Purchasing.Features.v1.PurchaseOrders.ReceivePurchaseOrder;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Purchasing.Tests.Features.PurchaseOrders;

public sealed class ReceivePurchaseOrderCommandHandlerTests : IDisposable
{
    private static readonly Guid MedicineA = Guid.CreateVersion7();
    private static readonly Guid MedicineB = Guid.CreateVersion7();
    private static readonly DateOnly Expiry = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1));

    private readonly string _databaseName = Guid.NewGuid().ToString();
    private readonly PurchasingDbContext _db;
    private readonly IStockReceiptService _stock = Substitute.For<IStockReceiptService>();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly ReceivePurchaseOrderCommandHandler _sut;

    public ReceivePurchaseOrderCommandHandlerTests()
    {
        _db = PurchasingDbContextFactory.Create(_databaseName);
        _currentUser.GetTenant().Returns("test-tenant");
        _currentUser.Name.Returns("clerk1");
        _stock.ReceiveAsync(Arg.Any<StockReceiptRequest>(), Arg.Any<CancellationToken>())
            .Returns(new List<StockReceiptLineResult>());
        _sut = new ReceivePurchaseOrderCommandHandler(
            _db, _stock, _outbox, _currentUser, _currentBranch, TimeProvider.System,
            NamesMediator.Create(inactiveSuppliers: [InactiveSupplier], exemptMedicines: [MedicineB]), PurchaseOrderBranchTests.Numbers());
    }

    private static readonly Guid InactiveSupplier = Guid.CreateVersion7();

    [Fact]
    public async Task Handle_Should_Date_The_Event_By_The_Receipt_Date_And_Join_The_Transaction()
    {
        var order = await SeedApprovedOrderAsync();
        var receivedOn = DateTime.UtcNow.AddDays(-3);

        await _sut.Handle(new ReceivePurchaseOrderCommand(order.Id, ReceiptDateUtc: receivedOn), CancellationToken.None);

        await _outbox.Received(1).AddAsync(
            Arg.Is<PurchaseOrderReceivedIntegrationEvent>(e => e.ReceivedAtUtc == receivedOn && e.OrderDateUtc == order.OrderDateUtc),
            Arg.Any<CancellationToken>());
        await _stock.Received(1).ReceiveAsync(Arg.Is<StockReceiptRequest>(r => r.JoinCallerTransaction), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_Should_Refuse_A_Second_Receive_Without_Moving_Stock()
    {
        var order = await SeedApprovedOrderAsync();
        await _sut.Handle(new ReceivePurchaseOrderCommand(order.Id), CancellationToken.None);
        _stock.ClearReceivedCalls();

        var ex = await Should.ThrowAsync<FSH.Framework.Core.Exceptions.CustomException>(() =>
            _sut.Handle(new ReceivePurchaseOrderCommand(order.Id), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
        await _stock.DidNotReceiveWithAnyArgs().ReceiveAsync(default!, default);
    }

    [Fact]
    public async Task Handle_Should_Refuse_An_Order_From_An_Inactive_Supplier()
    {
        var order = PurchaseOrder.CreateDraft(InactiveSupplier, DateTime.UtcNow, null);
        order.AddLine(MedicineA, "A-1", Expiry, 10m, 5m, 8m, null);
        order.Approve("manager1");
        _db.PurchaseOrders.Add(order);
        await _db.SaveChangesAsync(CancellationToken.None);

        await Should.ThrowAsync<FSH.Framework.Core.Exceptions.CustomException>(() =>
            _sut.Handle(new ReceivePurchaseOrderCommand(order.Id), CancellationToken.None).AsTask());
        await _stock.DidNotReceiveWithAnyArgs().ReceiveAsync(default!, default);
    }

    /// <summary>Approved order with batch details set: A = 10 x 5.00 (VAT 6.50), B = 4 x 20.00.</summary>
    private async Task<PurchaseOrder> SeedApprovedOrderAsync()
    {
        var order = PurchaseOrder.CreateDraft(Guid.CreateVersion7(), DateTime.UtcNow, "restock");
        order.AddLine(MedicineA, "A-1", Expiry, 10m, 5m, 8m, null, vatAmount: 6.5m);
        order.AddLine(MedicineB, "B-1", Expiry, 4m, 20m, 30m, null);
        order.Approve("manager1");
        _db.PurchaseOrders.Add(order);
        await _db.SaveChangesAsync(CancellationToken.None);
        return order;
    }

    private static Guid LineOf(PurchaseOrder order, Guid medicineId) => order.Lines.Single(l => l.MedicineId == medicineId).Id;

    private PurchasingDbContext FreshContext() => PurchasingDbContextFactory.Create(_databaseName);

    [Fact]
    public async Task Handle_Should_Receive_Everything_When_No_Quantities_Given()
    {
        var order = await SeedApprovedOrderAsync();

        var result = await _sut.Handle(new ReceivePurchaseOrderCommand(order.Id), CancellationToken.None);

        result.PurchaseOrderId.ShouldBe(order.Id);
        result.BackorderPurchaseOrderId.ShouldBeNull();
        result.ShortLineCount.ShouldBe(0);
        await _stock.Received(1).ReceiveAsync(
            Arg.Is<StockReceiptRequest>(r => r.Lines.Count == 2 && r.Lines.Sum(l => l.Quantity) == 14m),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_Should_Receive_Short_And_Raise_A_Draft_Backorder()
    {
        var order = await SeedApprovedOrderAsync();

        var result = await _sut.Handle(
            new ReceivePurchaseOrderCommand(order.Id,
            [
                new PurchaseOrderLineReceiptInput(LineOf(order, MedicineA), null, null, null, QuantityReceived: 6m),
                new PurchaseOrderLineReceiptInput(LineOf(order, MedicineB), null, null, null, QuantityReceived: 0m),
            ]),
            CancellationToken.None);

        result.ShortLineCount.ShouldBe(2);
        result.BackorderPurchaseOrderId.ShouldNotBeNull();

        // Stock and the AP/GL event see only what arrived.
        await _stock.Received(1).ReceiveAsync(
            Arg.Is<StockReceiptRequest>(r => r.Lines.Count == 1 && r.Lines[0].MedicineId == MedicineA && r.Lines[0].Quantity == 6m),
            Arg.Any<CancellationToken>());
        await _outbox.Received(1).AddAsync(
            Arg.Is<PurchaseOrderReceivedIntegrationEvent>(e => e.TotalAmount == 30m && e.VatAmount == 3.9m),
            Arg.Any<CancellationToken>());

        await using var db = FreshContext();
        var received = await db.PurchaseOrders.Include(o => o.Lines).SingleAsync(o => o.Id == order.Id);
        received.Status.ShouldBe(PurchaseOrderStatus.Received);
        received.Lines.ShouldHaveSingleItem().Quantity.ShouldBe(6m);
        var backorder = await db.PurchaseOrders.Include(o => o.Lines).SingleAsync(o => o.Id == result.BackorderPurchaseOrderId);
        backorder.OrderNumber.ShouldNotBeNull();
        received.Narration!.ShouldContain(backorder.OrderNumber);
        backorder.Status.ShouldBe(PurchaseOrderStatus.Draft);
        backorder.SupplierId.ShouldBe(order.SupplierId);
        backorder.Lines.Select(l => (l.MedicineId, l.Quantity)).ShouldBe([(MedicineA, 4m), (MedicineB, 4m)], ignoreOrder: true);
        backorder.TotalVatAmount.ShouldBe(2.6m);
    }

    [Fact]
    public async Task Handle_Should_Close_Short_Without_Backorder_When_Not_Requested()
    {
        var order = await SeedApprovedOrderAsync();

        var result = await _sut.Handle(
            new ReceivePurchaseOrderCommand(order.Id,
                [new PurchaseOrderLineReceiptInput(LineOf(order, MedicineB), null, null, null, QuantityReceived: 1m)],
                CreateBackorder: false),
            CancellationToken.None);

        result.ShortLineCount.ShouldBe(1);
        result.BackorderPurchaseOrderId.ShouldBeNull();
        await using var db = FreshContext();
        (await db.PurchaseOrders.CountAsync()).ShouldBe(1);
    }

    [Fact]
    public async Task Handle_Should_Not_Require_Batch_Details_For_A_Line_That_Did_Not_Arrive()
    {
        var order = PurchaseOrder.CreateDraft(Guid.CreateVersion7(), DateTime.UtcNow, null);
        order.AddLine(MedicineA, null, null, 10m, 5m, null, null);
        order.AddLine(MedicineB, null, null, 4m, 20m, null, null);
        order.Approve("manager1");
        _db.PurchaseOrders.Add(order);
        await _db.SaveChangesAsync(CancellationToken.None);

        var result = await _sut.Handle(
            new ReceivePurchaseOrderCommand(order.Id,
            [
                new PurchaseOrderLineReceiptInput(LineOf(order, MedicineA), "A-9", Expiry, 9m),
                new PurchaseOrderLineReceiptInput(LineOf(order, MedicineB), null, null, null, QuantityReceived: 0m),
            ]),
            CancellationToken.None);

        result.ShortLineCount.ShouldBe(1);
    }

    [Fact]
    public void Validator_Should_Reject_Negative_Or_Duplicate_Lines()
    {
        var validator = new ReceivePurchaseOrderCommandValidator();
        var lineId = Guid.CreateVersion7();

        validator.Validate(new ReceivePurchaseOrderCommand(Guid.CreateVersion7(),
            [new PurchaseOrderLineReceiptInput(lineId, null, null, null, QuantityReceived: -1m)])).IsValid.ShouldBeFalse();
        validator.Validate(new ReceivePurchaseOrderCommand(Guid.CreateVersion7(),
        [
            new PurchaseOrderLineReceiptInput(lineId, null, null, null, 1m),
            new PurchaseOrderLineReceiptInput(lineId, null, null, null, 2m),
        ])).IsValid.ShouldBeFalse();
        validator.Validate(new ReceivePurchaseOrderCommand(Guid.CreateVersion7(),
            [new PurchaseOrderLineReceiptInput(lineId, null, null, null, QuantityReceived: 0m)])).IsValid.ShouldBeTrue();
    }

    public void Dispose() => _db.Dispose();
}
