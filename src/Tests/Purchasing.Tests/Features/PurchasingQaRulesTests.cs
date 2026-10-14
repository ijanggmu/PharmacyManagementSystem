using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.v1.DirectGoodsReceipts;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Purchasing.Contracts.v1.Reports;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using FSH.Modules.Purchasing.Features.v1.DirectGoodsReceipts.CreateDirectGoodsReceipt;
using FSH.Modules.Purchasing.Features.v1.PurchaseOrders.ApprovePurchaseOrder;
using FSH.Modules.Purchasing.Features.v1.PurchaseOrders.CountOpenPurchaseOrdersForMedicine;
using FSH.Modules.Purchasing.Features.v1.PurchaseOrders.CreatePurchaseOrder;
using FSH.Modules.Purchasing.Features.v1.Reports.GetIrdPurchaseRegister;
using FSH.Modules.Purchasing.Services;
using FSH.Modules.Reference.Contracts.Controls;
using Mediator;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Purchasing.Tests.Features.PurchaseOrders;

namespace Purchasing.Tests.Features;

/// <summary>
/// Purchasing QA rules: medicines on a bill must exist and be live, VAT must fit the medicine's VAT status, expired
/// stock and a supplier invoice booked twice are refused, free samples are received, purchase orders are numbered and
/// can require a second approver, and the IRD register classifies by the medicine's VAT status.
/// </summary>
public sealed class PurchasingQaRulesTests : IDisposable
{
    private static readonly DateOnly Expiry = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1));
    private static readonly Guid BranchId = Guid.CreateVersion7();

    private readonly PurchasingDbContext _db = PurchasingDbContextFactory.Create();
    private readonly IStockReceiptService _stock = Substitute.For<IStockReceiptService>();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly ICurrentBranch _branch = Substitute.For<ICurrentBranch>();
    private readonly IReceiptNumberService _numbers = Substitute.For<IReceiptNumberService>();
    private readonly Guid _taxable = Guid.CreateVersion7();
    private readonly Guid _exempt = Guid.CreateVersion7();
    private readonly Guid _missing = Guid.CreateVersion7();
    private readonly Guid _supplier = Guid.CreateVersion7();

    public PurchasingQaRulesTests()
    {
        _branch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(BranchId);
        _branch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0));
        _numbers.ResolveBranchCodeAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>()).Returns("MAIN");
        _numbers.ReserveNextAsync(Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(3);
        _numbers.ReserveNextAsync(Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>()).Returns(9);
        _stock.ReceiveAsync(Arg.Any<StockReceiptRequest>(), Arg.Any<CancellationToken>())
            .Returns(ci => (IReadOnlyList<StockReceiptLineResult>)ci.Arg<StockReceiptRequest>().Lines
                .Select(l => new StockReceiptLineResult(l.MedicineId, Guid.CreateVersion7(), l.BatchNo ?? "AUTO", l.Quantity))
                .ToList());
    }

    public void Dispose() => _db.Dispose();

    private IMediator Mediator(IReadOnlyDictionary<string, string>? settings = null) =>
        NamesMediator.Create(
            medicines: new Dictionary<Guid, string> { [_taxable] = "Paracetamol", [_exempt] = "ORS" },
            missingMedicines: [_missing], exemptMedicines: [_exempt], tenantSettings: settings);

    private CreatePurchaseOrderCommandHandler CreateOrderHandler(ICurrentUser? user = null) =>
        new(_db, _branch, Mediator(), _numbers, user ?? PurchaseOrderBranchTests.User());

    private CreateDirectGoodsReceiptCommandHandler CreateReceiptHandler() =>
        new(_db, _stock, _outbox, PurchaseOrderBranchTests.User(), _branch, _numbers, Mediator());

    private static CreatePurchaseOrderCommand Order(params PurchaseOrderLineInput[] lines) =>
        new(Guid.CreateVersion7(), DateTime.UtcNow, null, lines);

    private CreateDirectGoodsReceiptCommand Receipt(string? invoice, params DirectGoodsReceiptLineInput[] lines) =>
        new(_supplier, DateTime.UtcNow, invoice, lines);

    #region Medicines

    [Fact]
    public async Task CreateOrder_Should_Refuse_A_Medicine_That_Does_Not_Exist_Or_Is_Archived()
    {
        await Should.ThrowAsync<NotFoundException>(() => CreateOrderHandler().Handle(
            Order(new PurchaseOrderLineInput(_missing, null, null, 5m, 10m, 15m)), CancellationToken.None).AsTask());

        _db.PurchaseOrders.ShouldBeEmpty();
    }

    [Fact]
    public async Task CountOpenOrders_Should_Count_Only_Draft_And_Approved_Orders_With_The_Medicine()
    {
        var draft = PurchaseOrder.CreateDraft(_supplier, DateTime.UtcNow, null);
        draft.AddLine(_taxable, null, null, 1m, 1m, 1m, null);
        var received = PurchaseOrder.CreateDraft(_supplier, DateTime.UtcNow, null);
        received.AddLine(_taxable, "B1", Expiry, 1m, 1m, 1m, null);
        received.Approve("a");
        received.Receive("a");
        var other = PurchaseOrder.CreateDraft(_supplier, DateTime.UtcNow, null);
        other.AddLine(_exempt, null, null, 1m, 1m, 1m, null);
        _db.PurchaseOrders.AddRange(draft, received, other);
        await _db.SaveChangesAsync();

        int count = await new CountOpenPurchaseOrdersForMedicineQueryHandler(_db)
            .Handle(new CountOpenPurchaseOrdersForMedicineQuery(_taxable), CancellationToken.None);

        count.ShouldBe(1);
    }

    #endregion

    #region VAT

    [Fact]
    public async Task CreateOrder_Should_Refuse_VAT_On_An_Exempt_Medicine()
    {
        var ex = await Should.ThrowAsync<CustomException>(() => CreateOrderHandler().Handle(
            Order(new PurchaseOrderLineInput(_exempt, null, null, 10m, 10m, 15m, VatAmount: 13m)), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        ex.ErrorMessages.ShouldContain(m => m.Contains("ORS", StringComparison.Ordinal));
    }

    [Fact]
    public async Task CreateOrder_Should_Refuse_VAT_That_Is_Not_The_Rate_On_The_Taxable_Value()
    {
        // 1 x 10.00 at 13% is 1.30; 900 is not supplier rounding.
        await Should.ThrowAsync<CustomException>(() => CreateOrderHandler().Handle(
            Order(new PurchaseOrderLineInput(_taxable, null, null, 1m, 10m, 15m, VatAmount: 900m)), CancellationToken.None).AsTask());
    }

    [Theory]
    [InlineData(130)]
    [InlineData(130.99)]
    [InlineData(129.01)]
    public async Task CreateOrder_Should_Accept_The_Rate_Within_A_Rupee_Of_Rounding(decimal vat)
    {
        Guid id = await CreateOrderHandler().Handle(
            Order(new PurchaseOrderLineInput(_taxable, null, null, 10m, 100m, 150m, VatAmount: vat)), CancellationToken.None);

        _db.PurchaseOrders.Single(o => o.Id == id).TotalVatAmount.ShouldBe(vat);
    }

    [Fact]
    public async Task DirectReceipt_Should_Accept_A_NonVat_Bill_For_Taxable_Medicines()
    {
        // A supplier not registered for VAT charges none on any line: accepted as is.
        Guid id = await CreateReceiptHandler().Handle(
            Receipt("NV-1", new DirectGoodsReceiptLineInput(_taxable, "B1", Expiry, 10m, 10m)), CancellationToken.None);

        _db.DirectGoodsReceipts.Single(r => r.Id == id).VatAmount.ShouldBe(0m);
    }

    [Fact]
    public async Task DirectReceipt_Should_Refuse_A_Taxable_Line_Without_VAT_On_A_VAT_Bill()
    {
        await Should.ThrowAsync<CustomException>(() => CreateReceiptHandler().Handle(
            Receipt(
                "V-1",
                new DirectGoodsReceiptLineInput(_taxable, "B1", Expiry, 10m, 10m, VatAmount: 13m),
                new DirectGoodsReceiptLineInput(_taxable, "B2", Expiry, 10m, 10m)),
            CancellationToken.None).AsTask());
    }

    #endregion

    #region Expiry, invoice numbers, free stock

    [Fact]
    public async Task DirectReceipt_And_Order_Should_Refuse_Stock_That_Has_Already_Expired()
    {
        var expired = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-3));

        var receipt = await Should.ThrowAsync<CustomException>(() => CreateReceiptHandler().Handle(
            Receipt(null, new DirectGoodsReceiptLineInput(_taxable, "OLD", expired, 10m, 10m)), CancellationToken.None).AsTask());
        receipt.Message.ShouldContain("expired");
        await Should.ThrowAsync<CustomException>(() => CreateOrderHandler().Handle(
            Order(new PurchaseOrderLineInput(_taxable, "OLD", expired, 10m, 10m, 15m)), CancellationToken.None).AsTask());

        _db.DirectGoodsReceipts.ShouldBeEmpty();
        _db.PurchaseOrders.ShouldBeEmpty();
    }

    [Theory]
    [InlineData("QA-INV-DGR-1")]
    [InlineData("  qa-inv-dgr-1 ")]
    public async Task DirectReceipt_Should_Refuse_A_Supplier_Invoice_Already_Booked(string again)
    {
        await CreateReceiptHandler().Handle(
            Receipt("QA-INV-DGR-1", new DirectGoodsReceiptLineInput(_taxable, "B1", Expiry, 10m, 10m)), CancellationToken.None);

        var ex = await Should.ThrowAsync<CustomException>(() => CreateReceiptHandler().Handle(
            Receipt(again, new DirectGoodsReceiptLineInput(_taxable, "B2", Expiry, 10m, 10m)), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await _db.DirectGoodsReceipts.CountAsync()).ShouldBe(1);
    }

    [Fact]
    public async Task DirectReceipt_Should_Allow_The_Invoice_Number_Again_Once_The_Receipt_Is_Voided()
    {
        Guid first = await CreateReceiptHandler().Handle(
            Receipt("INV-7", new DirectGoodsReceiptLineInput(_taxable, "B1", Expiry, 10m, 10m)), CancellationToken.None);
        _db.DirectGoodsReceipts.Single(r => r.Id == first).Void("tester", "wrong supplier");
        await _db.SaveChangesAsync();

        await CreateReceiptHandler().Handle(
            Receipt("INV-7", new DirectGoodsReceiptLineInput(_taxable, "B2", Expiry, 10m, 10m)), CancellationToken.None);

        (await _db.DirectGoodsReceipts.CountAsync()).ShouldBe(2);
    }

    [Fact]
    public async Task DirectReceipt_Should_Receive_A_Free_Sample_At_Zero_Cost()
    {
        Guid id = await CreateReceiptHandler().Handle(
            Receipt(
                "S-1",
                new DirectGoodsReceiptLineInput(_taxable, "PAID", Expiry, 10m, 10m),
                new DirectGoodsReceiptLineInput(_exempt, "SAMPLE", Expiry, 5m, 0m)),
            CancellationToken.None);

        var receipt = await _db.DirectGoodsReceipts.Include(r => r.Lines).SingleAsync(r => r.Id == id);
        receipt.Lines.Count.ShouldBe(2);
        receipt.GrossAmount.ShouldBe(100m);
        await _stock.Received(1).ReceiveAsync(
            Arg.Is<StockReceiptRequest>(r => r.Lines.Count == 2
                && r.Lines.Any(l => l.BatchNo == "SAMPLE" && l.Quantity == 5m && l.CostPrice == 0m)),
            Arg.Any<CancellationToken>());
    }

    #endregion

    #region Numbering and approval

    [Fact]
    public async Task CreateOrder_Should_Number_The_Order_And_Record_Its_Creator()
    {
        Guid creator = Guid.CreateVersion7();
        Guid id = await CreateOrderHandler(PurchaseOrderBranchTests.User(creator)).Handle(
            new CreatePurchaseOrderCommand(
                _supplier, new DateTime(2026, 10, 9, 6, 0, 0, DateTimeKind.Utc), null,
                [new PurchaseOrderLineInput(_taxable, null, null, 5m, 10m, 15m)]),
            CancellationToken.None);

        var order = _db.PurchaseOrders.Single(o => o.Id == id);
        order.OrderNumber.ShouldBe("PO-MAIN-2083/84-00003");
        order.FiscalYear.ShouldBe(2083);
        order.CreatedBy.ShouldBe(creator.ToString());
        await _numbers.Received(1).ReserveNextAsync(BranchId, 2083, PurchasingSeries.PurchaseOrder, Arg.Any<CancellationToken>());
    }

    private async Task<PurchaseOrder> SeedDraftAsync(Guid creator)
    {
        var order = PurchaseOrder.CreateDraft(_supplier, DateTime.UtcNow, null, branchId: BranchId, createdBy: creator.ToString());
        order.AddLine(_taxable, "B1", Expiry, 1m, 1m, 1m, null);
        order.AssignNumber("PO-MAIN-2083/84-00001", 2083);
        _db.PurchaseOrders.Add(order);
        await _db.SaveChangesAsync();
        return order;
    }

    private ApprovePurchaseOrderCommandHandler Approver(Guid userId, bool secondApprover)
    {
        var settings = new Dictionary<string, string> { [InternalControlSettings.PoSecondApproverKey] = secondApprover ? "true" : "false" };
        return new ApprovePurchaseOrderCommandHandler(_db, PurchaseOrderBranchTests.User(userId), _branch, Mediator(settings));
    }

    [Fact]
    public async Task Approve_Should_Refuse_The_Creator_When_A_Second_Approver_Is_Required()
    {
        Guid creator = Guid.CreateVersion7();
        var order = await SeedDraftAsync(creator);

        var ex = await Should.ThrowAsync<ForbiddenException>(() =>
            Approver(creator, secondApprover: true).Handle(new ApprovePurchaseOrderCommand(order.Id), CancellationToken.None).AsTask());
        ex.Message.ShouldContain("second approver");

        await Approver(Guid.CreateVersion7(), secondApprover: true).Handle(new ApprovePurchaseOrderCommand(order.Id), CancellationToken.None);
        _db.PurchaseOrders.Single(o => o.Id == order.Id).Status.ShouldBe(PurchaseOrderStatus.Approved);
    }

    [Fact]
    public async Task Approve_Should_Let_The_Creator_Approve_When_The_Control_Is_Off()
    {
        Guid creator = Guid.CreateVersion7();
        var order = await SeedDraftAsync(creator);

        await Approver(creator, secondApprover: false).Handle(new ApprovePurchaseOrderCommand(order.Id), CancellationToken.None);

        _db.PurchaseOrders.Single(o => o.Id == order.Id).Status.ShouldBe(PurchaseOrderStatus.Approved);
    }

    [Fact]
    public async Task Approve_Should_Say_The_Order_Is_Already_Approved()
    {
        var order = await SeedDraftAsync(Guid.CreateVersion7());
        await Approver(Guid.CreateVersion7(), secondApprover: false).Handle(new ApprovePurchaseOrderCommand(order.Id), CancellationToken.None);

        var ex = await Should.ThrowAsync<CustomException>(() =>
            Approver(Guid.CreateVersion7(), secondApprover: true).Handle(new ApprovePurchaseOrderCommand(order.Id), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        ex.Message.ShouldBe("Purchase order PO-MAIN-2083/84-00001 is already approved.");
    }

    [Fact]
    public void OrderValidator_Should_Refuse_An_Order_Dated_In_The_Future()
    {
        var validator = new CreatePurchaseOrderCommandValidator();
        var line = new PurchaseOrderLineInput(_taxable, null, null, 1m, 1m, 1m);

        validator.Validate(new CreatePurchaseOrderCommand(_supplier, new DateTime(2030, 1, 1, 0, 0, 0, DateTimeKind.Utc), null, [line]))
            .IsValid.ShouldBeFalse();
        validator.Validate(new CreatePurchaseOrderCommand(_supplier, DateTime.UtcNow, null, [line])).IsValid.ShouldBeTrue();
    }

    #endregion

    [Fact]
    public async Task IrdRegister_Should_Classify_By_The_Medicines_VAT_Status_Not_The_VAT_Charged()
    {
        // A taxable medicine bought on a non-VAT bill is still a taxable purchase; an exempt one is exempt.
        var receipt = DirectGoodsReceipt.Create(_supplier, DateTime.UtcNow, "NV-9", "tester", BranchId);
        receipt.AddLine(_taxable, 10m, 10m, 0m);
        receipt.AddLine(_exempt, 5m, 4m, 0m);
        _db.DirectGoodsReceipts.Add(receipt);
        await _db.SaveChangesAsync();
        var mediator = Mediator();
        mediator.Send(Arg.Any<FSH.Modules.Suppliers.Contracts.v1.Returns.GetSupplierDebitNotesQuery>(), Arg.Any<CancellationToken>())
            .Returns(new List<FSH.Modules.Suppliers.Contracts.Dtos.SupplierDebitNoteRegisterDto>());

        var row = (await new GetIrdPurchaseRegisterQueryHandler(_db, mediator, _branch).Handle(
            new GetIrdPurchaseRegisterQuery(DateTime.UtcNow.AddDays(-1), DateTime.UtcNow.AddDays(1)), CancellationToken.None))
            .ShouldHaveSingleItem();

        row.TaxableAmount.ShouldBe(100m);
        row.ExemptAmount.ShouldBe(20m);
    }
}
