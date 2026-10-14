using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.Events;
using FSH.Modules.Purchasing.Contracts.v1.DirectGoodsReceipts;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Features.v1.DirectGoodsReceipts.CreateDirectGoodsReceipt;
using FSH.Modules.Purchasing.Features.v1.DirectGoodsReceipts.VoidDirectGoodsReceipt;
using FSH.Modules.Purchasing.Features.v1.PurchaseOrders.CreatePurchaseOrder;
using FSH.Modules.Purchasing.Features.v1.PurchaseOrders.ReceivePurchaseOrder;
using FSH.Modules.Purchasing.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Purchasing.Tests.Features;

/// <summary>
/// Free (bonus) quantity, trade/bill discounts and pack entry through the purchase handlers: stock goes in as
/// paid + free units at the effective cost, the posted events carry the discounted net (so AP and the GL voucher
/// are net of discounts) and a void takes the free units back out too.
/// </summary>
public sealed class PurchaseDiscountsAndFreeGoodsHandlerTests : IDisposable
{
    private static readonly Guid BranchId = Guid.CreateVersion7();
    private static readonly DateOnly Expiry = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(2));

    private readonly PurchasingDbContext _db = PurchasingDbContextFactory.Create();
    private readonly IStockReceiptService _stock = Substitute.For<IStockReceiptService>();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly IReceiptNumberService _receiptNumbers = Substitute.For<IReceiptNumberService>();
    private readonly Guid _medicineA = Guid.CreateVersion7();
    private readonly Guid _medicineB = Guid.CreateVersion7();
    private readonly Guid _boxedMedicine = Guid.CreateVersion7();
    private readonly IMediator _mediator;

    public PurchaseDiscountsAndFreeGoodsHandlerTests()
    {
        _currentUser.GetTenant().Returns("test-tenant");
        _currentUser.Name.Returns("clerk1");
        _currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(BranchId);
        _currentBranch.CanViewAllBranchesAsync(Arg.Any<CancellationToken>()).Returns(true);
        _stock.ReceiveAsync(Arg.Any<StockReceiptRequest>(), Arg.Any<CancellationToken>())
            .Returns(ci => (IReadOnlyList<StockReceiptLineResult>)ci.Arg<StockReceiptRequest>().Lines
                .Select(l => new StockReceiptLineResult(l.MedicineId, Guid.CreateVersion7(), l.BatchNo ?? "AUTO", l.Quantity))
                .ToList());
        _stock.ReverseReceiptAsync(Arg.Any<StockReceiptReversalRequest>(), Arg.Any<CancellationToken>())
            .Returns(new List<StockReceiptReversalLineResult>());
        _receiptNumbers.ResolveBranchCodeAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>()).Returns("MAIN");
        _receiptNumbers.ReserveNextAsync(Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>()).Returns(1);
        _mediator = NamesMediator.Create(
            medicinePrices: new Dictionary<Guid, decimal> { [_medicineA] = 120m, [_medicineB] = 30m, [_boxedMedicine] = 15m },
            unitsPerPack: new Dictionary<Guid, int> { [_boxedMedicine] = 10 });
    }

    public void Dispose() => _db.Dispose();

    private CreateDirectGoodsReceiptCommandHandler CreateReceiptHandler() =>
        new(_db, _stock, _outbox, _currentUser, _currentBranch, _receiptNumbers, _mediator);

    /// <summary>A: 10 + 1 free at 100, 10% off (900); B: 5 at 20 (100); bill discount 50 (45 / 5). VAT on A only.</summary>
    private CreateDirectGoodsReceiptCommand SchemeBill() => new(
        Guid.CreateVersion7(), DateTime.UtcNow, "INV-9",
        [
            new DirectGoodsReceiptLineInput(_medicineA, "A1", Expiry, 10m, 100m, VatAmount: 111.15m, FreeQuantity: 1m, DiscountPercent: 10m),
            new DirectGoodsReceiptLineInput(_medicineB, "B1", Expiry, 5m, 20m),
        ],
        BillDiscountAmount: 50m);

    [Fact]
    public async Task DirectReceipt_Should_Stock_PaidPlusFree_At_EffectiveCost()
    {
        await CreateReceiptHandler().Handle(SchemeBill(), CancellationToken.None);

        await _stock.Received(1).ReceiveAsync(
            Arg.Is<StockReceiptRequest>(r =>
                r.Lines[0].Quantity == 11m && r.Lines[0].FreeQuantity == 1m && r.Lines[0].CostPrice == 77.7273m
                && r.Lines[1].Quantity == 5m && r.Lines[1].CostPrice == 19m),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task DirectReceipt_Should_Post_The_Discounted_Bill()
    {
        var id = await CreateReceiptHandler().Handle(SchemeBill(), CancellationToken.None);

        // Net 950 (1100 - 100 line - 50 bill) + VAT 111.15 = AP 1061.15.
        await _outbox.Received(1).AddAsync(
            Arg.Is<DirectGoodsReceiptPostedIntegrationEvent>(e => e.ReceiptId == id && e.GrossAmount == 1061.15m && e.VatAmount == 111.15m),
            Arg.Any<CancellationToken>());
        var saved = await _db.DirectGoodsReceipts.Include(r => r.Lines).SingleAsync(r => r.Id == id);
        saved.BillDiscountAmount.ShouldBe(50m);
        saved.Lines.Sum(l => l.BillDiscountAmount).ShouldBe(50m);
        saved.NetAmount.ShouldBe(950m);
    }

    [Fact]
    public async Task DirectReceipt_Should_Convert_Packs_To_Units()
    {
        // 3 boxes + 1 free box of 10 at Rs 120 a box: 30 + 10 units, gross 360, effective 9.00 a unit.
        var command = new CreateDirectGoodsReceiptCommand(
            Guid.CreateVersion7(), DateTime.UtcNow, null,
            [new DirectGoodsReceiptLineInput(_boxedMedicine, "X1", Expiry, 3m, 120m, FreeQuantity: 1m, InPacks: true)]);

        var id = await CreateReceiptHandler().Handle(command, CancellationToken.None);

        var line = (await _db.DirectGoodsReceipts.Include(r => r.Lines).SingleAsync(r => r.Id == id)).Lines.Single();
        line.Quantity.ShouldBe(30m);
        line.FreeQuantity.ShouldBe(10m);
        line.UnitCostPrice.ShouldBe(12m);
        line.PackSize.ShouldBe(10m);
        line.PackUnitCost.ShouldBe(120m);
        line.GrossAmount.ShouldBe(360m);
        line.EffectiveUnitCost.ShouldBe(9m);
        await _stock.Received(1).ReceiveAsync(
            Arg.Is<StockReceiptRequest>(r => r.Lines.Single().Quantity == 40m && r.Lines.Single().CostPrice == 9m),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task DirectReceipt_Should_Refuse_Packs_For_A_Medicine_Without_A_Pack_Size()
    {
        var command = new CreateDirectGoodsReceiptCommand(
            Guid.CreateVersion7(), DateTime.UtcNow, null,
            [new DirectGoodsReceiptLineInput(_medicineA, "A1", Expiry, 3m, 120m, InPacks: true)]);

        await Should.ThrowAsync<CustomException>(() => CreateReceiptHandler().Handle(command, CancellationToken.None).AsTask());
    }

    [Fact]
    public async Task Void_Should_Take_The_Free_Units_Back_Out_And_Reverse_The_Discounted_Bill()
    {
        var id = await CreateReceiptHandler().Handle(SchemeBill(), CancellationToken.None);
        _db.ChangeTracker.Clear();

        await new VoidDirectGoodsReceiptCommandHandler(_db, _stock, _outbox, _currentUser, _currentBranch)
            .Handle(new VoidDirectGoodsReceiptCommand(id, "wrong supplier"), CancellationToken.None);

        await _stock.Received(1).ReverseReceiptAsync(
            Arg.Is<StockReceiptReversalRequest>(r => r.Lines[0].Quantity == 11m && r.Lines[1].Quantity == 5m),
            Arg.Any<CancellationToken>());
        await _outbox.Received(1).AddAsync(
            Arg.Is<DirectGoodsReceiptVoidedIntegrationEvent>(e => e.ReceiptId == id && e.GrossAmount == 1061.15m),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public void ReceiptValidator_Should_Reject_Discounts_Above_The_Bill()
    {
        var validator = new CreateDirectGoodsReceiptCommandValidator();

        validator.Validate(SchemeBill() with { BillDiscountAmount = 1000.01m }).IsValid.ShouldBeFalse();
        validator.Validate(SchemeBill() with { BillDiscountAmount = 1000m }).IsValid.ShouldBeTrue();
        validator.Validate(SchemeBill() with
        {
            Lines = [new DirectGoodsReceiptLineInput(_medicineB, "B1", Expiry, 5m, 20m, DiscountAmount: 100.01m)],
            BillDiscountAmount = 0m,
        }).IsValid.ShouldBeFalse();
    }

    [Fact]
    public void ReceiptValidator_Should_Cap_Payment_At_The_Discounted_Bill()
    {
        var validator = new CreateDirectGoodsReceiptCommandValidator();

        validator.Validate(SchemeBill() with { Payment = new DirectGoodsReceiptPaymentInput("cash", 1061.15m) }).IsValid.ShouldBeTrue();
        validator.Validate(SchemeBill() with { Payment = new DirectGoodsReceiptPaymentInput("cash", 1061.16m) }).IsValid.ShouldBeFalse();
    }

    [Fact]
    public async Task PurchaseOrder_Should_Receive_At_EffectiveCost_And_Post_Net_Of_Discounts()
    {
        var orderId = await new CreatePurchaseOrderCommandHandler(_db, _currentBranch, _mediator).Handle(
            new CreatePurchaseOrderCommand(
                Guid.CreateVersion7(), DateTime.UtcNow, null,
                [
                    new PurchaseOrderLineInput(_boxedMedicine, "X1", Expiry, 2m, 100m, 15m, VatAmount: 23.4m, FreeQuantity: 1m, DiscountAmount: 20m, InPacks: true),
                ],
                BillDiscountPercent: 10m),
            CancellationToken.None);
        var order = await _db.PurchaseOrders.Include(o => o.Lines).SingleAsync(o => o.Id == orderId);
        // 2 boxes x 100 = 200 - 20 = 180 - 10% bill (18) = 162 taxable; 30 units (20 + 10 free).
        order.BillDiscountAmount.ShouldBe(18m);
        order.TotalAmount.ShouldBe(162m);
        order.Lines.Single().EffectiveUnitCost.ShouldBe(5.4m);
        order.Approve("manager1");
        await _db.SaveChangesAsync();

        await new ReceivePurchaseOrderCommandHandler(_db, _stock, _outbox, _currentUser, _currentBranch, TimeProvider.System, _mediator)
            .Handle(new ReceivePurchaseOrderCommand(orderId), CancellationToken.None);

        await _stock.Received(1).ReceiveAsync(
            Arg.Is<StockReceiptRequest>(r => r.Lines.Single().Quantity == 30m && r.Lines.Single().CostPrice == 5.4m && r.Lines.Single().FreeQuantity == 10m),
            Arg.Any<CancellationToken>());
        await _outbox.Received(1).AddAsync(
            Arg.Is<PurchaseOrderReceivedIntegrationEvent>(e => e.PurchaseOrderId == orderId && e.TotalAmount == 162m && e.VatAmount == 23.4m),
            Arg.Any<CancellationToken>());
    }
}
