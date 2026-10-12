using FSH.Framework.Core.Exceptions;
using FSH.Modules.Purchasing.Contracts.Dtos;
using FSH.Modules.Purchasing.Contracts.v1.Reports;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using FSH.Modules.Purchasing.Features.v1.Reports.GetIrdPurchaseRegister;
using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using Mediator;
using NSubstitute;
using Purchasing.Tests.Features;

namespace Purchasing.Tests.Features.Reports;

public sealed class GetIrdPurchaseRegisterQueryHandlerTests : IDisposable
{
    private readonly PurchasingDbContext _db = PurchasingDbContextFactory.Create();
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly GetIrdPurchaseRegisterQueryHandler _sut;

    /// <summary>A caller with access to every branch: the requested branch filter is used as given.</summary>
    private static FSH.Modules.Multitenancy.Contracts.ICurrentBranch AllBranches()
    {
        var branch = Substitute.For<FSH.Modules.Multitenancy.Contracts.ICurrentBranch>();
        branch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0));
        branch.CanViewAllBranchesAsync(Arg.Any<CancellationToken>()).Returns(true);
        return branch;
    }

    public GetIrdPurchaseRegisterQueryHandlerTests()
    {
        _sut = new GetIrdPurchaseRegisterQueryHandler(_db, _mediator, AllBranches());
        _mediator.Send(Arg.Any<FSH.Modules.Suppliers.Contracts.v1.Returns.GetSupplierDebitNotesQuery>(), Arg.Any<CancellationToken>())
            .Returns(new List<FSH.Modules.Suppliers.Contracts.Dtos.SupplierDebitNoteRegisterDto>());
    }

    [Fact]
    public async Task Debit_Notes_Should_Appear_As_Negative_Purchases()
    {
        var supplierId = Guid.CreateVersion7();
        _mediator.Send(Arg.Any<FSH.Modules.Suppliers.Contracts.v1.Returns.GetSupplierDebitNotesQuery>(), Arg.Any<CancellationToken>())
            .Returns(new List<FSH.Modules.Suppliers.Contracts.Dtos.SupplierDebitNoteRegisterDto>
            {
                new(Guid.CreateVersion7(), DateTime.UtcNow, supplierId, "DN-MAIN-2083/84-00001", "BILL-1", 100m, 13m, null),
            });
        _mediator.Send(Arg.Is<GetSupplierByIdQuery>(q => q.SupplierId == supplierId), Arg.Any<CancellationToken>())
            .Returns(new SupplierDto(supplierId, "Acme Pharma", null, null, null, null, null, 0m, true, DateTime.UtcNow, null));

        var rows = await _sut.Handle(
            new GetIrdPurchaseRegisterQuery(DateTime.UtcNow.AddDays(-1), DateTime.UtcNow.AddDays(1)), CancellationToken.None);

        var row = rows.ShouldHaveSingleItem();
        row.Source.ShouldBe(FSH.Modules.Purchasing.Contracts.Dtos.IrdPurchaseRegisterRowDto.DebitNoteSource);
        row.SupplierInvoiceNumber.ShouldBe("DN-MAIN-2083/84-00001");
        row.TaxableAmount.ShouldBe(-100m);
        row.VatAmount.ShouldBe(-13m);
        row.TotalAmount.ShouldBe(-113m);
    }

    private static PurchaseOrder ReceivedOrder(
        Guid supplierId, DateTime orderDateUtc, DateTime receivedAtUtc, string? invoice = null,
        decimal quantity = 10m, decimal unitCost = 5m, decimal vatAmount = 0m)
    {
        var order = PurchaseOrder.CreateDraft(supplierId, orderDateUtc, null, invoice);
        order.AddLine(Guid.CreateVersion7(), "B1", null, quantity, unitCost, 8m, null, vatAmount);
        order.Approve("tester");
        order.Receive("tester", receivedAtUtc);
        return order;
    }

    [Fact]
    public async Task Handle_Should_Return_Empty_When_No_Orders_In_Period()
    {
        var result = await _sut.Handle(
            new GetIrdPurchaseRegisterQuery(DateTime.UtcNow.AddDays(-1), DateTime.UtcNow.AddDays(1)), CancellationToken.None);

        result.ShouldBeEmpty();
    }

    [Fact]
    public async Task Handle_Should_Return_Row_With_Resolved_SupplierName()
    {
        var supplierId = Guid.CreateVersion7();
        var order = ReceivedOrder(supplierId, DateTime.UtcNow, DateTime.UtcNow, "SUP-INV-1", vatAmount: 6.5m);
        _db.PurchaseOrders.Add(order);
        await _db.SaveChangesAsync(CancellationToken.None);

        _mediator.Send(Arg.Is<GetSupplierByIdQuery>(q => q.SupplierId == supplierId), Arg.Any<CancellationToken>())
            .Returns(new SupplierDto(supplierId, "Acme Pharma", null, null, null, null, null, 0m, true, DateTime.UtcNow, null));

        var result = await _sut.Handle(
            new GetIrdPurchaseRegisterQuery(order.OrderDateUtc.AddDays(-1), order.OrderDateUtc.AddDays(1)), CancellationToken.None);

        var row = result.ShouldHaveSingleItem();
        row.OrderId.ShouldBe(order.Id);
        row.SupplierId.ShouldBe(supplierId);
        row.SupplierName.ShouldBe("Acme Pharma");
        row.SupplierInvoiceNumber.ShouldBe("SUP-INV-1");
        row.TaxableAmount.ShouldBe(50m);
        row.VatAmount.ShouldBe(6.5m);
        row.TotalAmount.ShouldBe(56.5m);
        row.Status.ShouldBe("Received");
    }

    [Fact]
    public async Task Handle_Should_Use_Dash_When_Supplier_Not_Found()
    {
        var supplierId = Guid.CreateVersion7();
        var order = ReceivedOrder(supplierId, DateTime.UtcNow, DateTime.UtcNow);
        _db.PurchaseOrders.Add(order);
        await _db.SaveChangesAsync(CancellationToken.None);

        _mediator.Send(Arg.Is<GetSupplierByIdQuery>(q => q.SupplierId == supplierId), Arg.Any<CancellationToken>())
            .Returns<SupplierDto>(_ => throw new NotFoundException("not found"));

        var result = await _sut.Handle(
            new GetIrdPurchaseRegisterQuery(order.OrderDateUtc.AddDays(-1), order.OrderDateUtc.AddDays(1)), CancellationToken.None);

        result.ShouldHaveSingleItem().SupplierName.ShouldBe("—");
    }

    [Fact]
    public async Task Handle_Should_Exclude_Order_Outside_Period()
    {
        var order = ReceivedOrder(Guid.CreateVersion7(), DateTime.UtcNow, DateTime.UtcNow);
        _db.PurchaseOrders.Add(order);
        await _db.SaveChangesAsync(CancellationToken.None);

        var result = await _sut.Handle(
            new GetIrdPurchaseRegisterQuery(order.OrderDateUtc.AddDays(-10), order.OrderDateUtc.AddDays(-5)), CancellationToken.None);

        result.ShouldBeEmpty();
    }

    [Fact]
    public async Task Handle_Should_Exclude_Draft_Approved_And_Cancelled_Orders()
    {
        var now = DateTime.UtcNow;
        var draft = PurchaseOrder.CreateDraft(Guid.CreateVersion7(), now, null, null);
        draft.AddLine(Guid.CreateVersion7(), null, null, 1m, 2m, null, null);
        var approved = PurchaseOrder.CreateDraft(Guid.CreateVersion7(), now, null, null);
        approved.AddLine(Guid.CreateVersion7(), null, null, 1m, 2m, null, null);
        approved.Approve("tester");
        var cancelled = PurchaseOrder.CreateDraft(Guid.CreateVersion7(), now, null, null);
        cancelled.AddLine(Guid.CreateVersion7(), null, null, 1m, 2m, null, null);
        cancelled.Cancel("not needed");
        _db.PurchaseOrders.AddRange(draft, approved, cancelled);
        await _db.SaveChangesAsync(CancellationToken.None);

        var result = await _sut.Handle(new GetIrdPurchaseRegisterQuery(now.AddDays(-1), now.AddDays(1)), CancellationToken.None);

        result.ShouldBeEmpty();
    }

    [Fact]
    public async Task Handle_Should_Date_Order_By_Receipt_Not_Order_Date()
    {
        var supplierId = Guid.CreateVersion7();
        var orderedInAugust = new DateTime(2026, 8, 28, 0, 0, 0, DateTimeKind.Utc);
        var billInSeptember = new DateTime(2026, 9, 3, 0, 0, 0, DateTimeKind.Utc);
        _db.PurchaseOrders.Add(ReceivedOrder(supplierId, orderedInAugust, billInSeptember));
        await _db.SaveChangesAsync(CancellationToken.None);
        _mediator.Send(Arg.Any<GetSupplierByIdQuery>(), Arg.Any<CancellationToken>())
            .Returns<SupplierDto>(_ => throw new NotFoundException("not found"));

        var august = await _sut.Handle(new GetIrdPurchaseRegisterQuery(
            new DateTime(2026, 8, 1, 0, 0, 0, DateTimeKind.Utc), new DateTime(2026, 8, 31, 23, 59, 59, DateTimeKind.Utc)), CancellationToken.None);
        var september = await _sut.Handle(new GetIrdPurchaseRegisterQuery(
            new DateTime(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc), new DateTime(2026, 9, 30, 23, 59, 59, DateTimeKind.Utc)), CancellationToken.None);

        august.ShouldBeEmpty();
        september.ShouldHaveSingleItem().OrderDateUtc.ShouldBe(billInSeptember);
    }

    [Fact]
    public async Task Handle_Should_Include_Received_Direct_Goods_Receipt_With_Gross_Amount()
    {
        var supplierId = Guid.CreateVersion7();
        var receipt = DirectGoodsReceipt.Create(supplierId, DateTime.UtcNow, "BILL-7", "tester", Guid.CreateVersion7());
        receipt.AddLine(Guid.CreateVersion7(), 10m, 20m, 26m);
        _db.DirectGoodsReceipts.Add(receipt);
        await _db.SaveChangesAsync(CancellationToken.None);

        _mediator.Send(Arg.Is<GetSupplierByIdQuery>(q => q.SupplierId == supplierId), Arg.Any<CancellationToken>())
            .Returns(new SupplierDto(supplierId, "Acme Pharma", null, null, null, null, null, 0m, true, DateTime.UtcNow, null));

        var result = await _sut.Handle(
            new GetIrdPurchaseRegisterQuery(receipt.ReceiptDateUtc.AddDays(-1), receipt.ReceiptDateUtc.AddDays(1)), CancellationToken.None);

        var row = result.ShouldHaveSingleItem();
        row.OrderId.ShouldBe(receipt.Id);
        row.OrderDateUtc.ShouldBe(receipt.ReceiptDateUtc);
        row.SupplierName.ShouldBe("Acme Pharma");
        row.SupplierInvoiceNumber.ShouldBe("BILL-7");
        row.TaxableAmount.ShouldBe(200m);
        row.VatAmount.ShouldBe(26m);
        row.TotalAmount.ShouldBe(226m);
        row.Status.ShouldBe("Received");
        row.Source.ShouldBe(IrdPurchaseRegisterRowDto.DirectGoodsReceiptSource);
    }

    [Fact]
    public async Task Voided_Receipt_Should_Stay_In_Its_Original_Period_And_Reverse_In_The_Void_Period()
    {
        var receiptDate = DateTime.UtcNow.AddDays(-40);
        var receipt = DirectGoodsReceipt.Create(Guid.CreateVersion7(), receiptDate, "BILL-9", "tester", Guid.CreateVersion7());
        receipt.AddLine(Guid.CreateVersion7(), 10m, 10m, 13m);
        receipt.Void("tester", "wrong entry");
        _db.DirectGoodsReceipts.Add(receipt);
        await _db.SaveChangesAsync(CancellationToken.None);
        _mediator.Send(Arg.Any<GetSupplierByIdQuery>(), Arg.Any<CancellationToken>())
            .Returns<SupplierDto>(_ => throw new NotFoundException("not found"));

        var originalPeriod = await _sut.Handle(
            new GetIrdPurchaseRegisterQuery(receiptDate.AddDays(-1), receiptDate.AddDays(1)), CancellationToken.None);
        var voidPeriod = await _sut.Handle(
            new GetIrdPurchaseRegisterQuery(DateTime.UtcNow.AddDays(-1), DateTime.UtcNow.AddDays(1)), CancellationToken.None);

        var original = originalPeriod.ShouldHaveSingleItem();
        original.Source.ShouldBe(IrdPurchaseRegisterRowDto.DirectGoodsReceiptSource);
        original.TotalAmount.ShouldBe(113m);
        original.OrderDateUtc.ShouldBe(receiptDate);

        var reversal = voidPeriod.ShouldHaveSingleItem();
        reversal.Source.ShouldBe(IrdPurchaseRegisterRowDto.DirectGoodsReceiptVoidSource);
        reversal.OrderDateUtc.ShouldBe(receipt.VoidedAtUtc!.Value);
        reversal.TaxableAmount.ShouldBe(-100m);
        reversal.VatAmount.ShouldBe(-13m);
        reversal.TotalAmount.ShouldBe(-113m);
    }

    [Fact]
    public async Task Voided_Receipt_In_The_Same_Period_Should_Net_To_Zero()
    {
        var receipt = DirectGoodsReceipt.Create(Guid.CreateVersion7(), DateTime.UtcNow.AddHours(-1), null, "tester", Guid.CreateVersion7());
        receipt.AddLine(Guid.CreateVersion7(), 1m, 5m, 0m);
        receipt.Void("tester", "wrong entry");
        _db.DirectGoodsReceipts.Add(receipt);
        await _db.SaveChangesAsync(CancellationToken.None);
        _mediator.Send(Arg.Any<GetSupplierByIdQuery>(), Arg.Any<CancellationToken>())
            .Returns<SupplierDto>(_ => throw new NotFoundException("not found"));

        var result = await _sut.Handle(
            new GetIrdPurchaseRegisterQuery(DateTime.UtcNow.AddDays(-1), DateTime.UtcNow.AddDays(1)), CancellationToken.None);

        result.Count.ShouldBe(2);
        result.Sum(r => r.TotalAmount).ShouldBe(0m);
        result.Sum(r => r.ExemptAmount).ShouldBe(0m);
    }

    [Fact]
    public async Task Exempt_Lines_Should_Not_Be_Counted_As_Taxable()
    {
        var receipt = DirectGoodsReceipt.Create(Guid.CreateVersion7(), DateTime.UtcNow, null, "tester", Guid.CreateVersion7());
        receipt.AddLine(Guid.CreateVersion7(), 10m, 10m, 13m);   // taxable: 100 net + 13 VAT
        receipt.AddLine(Guid.CreateVersion7(), 4m, 25m, 0m);     // VAT-exempt: 100 net
        _db.DirectGoodsReceipts.Add(receipt);
        var order = ReceivedOrder(Guid.CreateVersion7(), DateTime.UtcNow, DateTime.UtcNow);   // 50 net, no VAT
        _db.PurchaseOrders.Add(order);
        await _db.SaveChangesAsync(CancellationToken.None);
        _mediator.Send(Arg.Any<GetSupplierByIdQuery>(), Arg.Any<CancellationToken>())
            .Returns<SupplierDto>(_ => throw new NotFoundException("not found"));

        var result = await _sut.Handle(
            new GetIrdPurchaseRegisterQuery(DateTime.UtcNow.AddDays(-1), DateTime.UtcNow.AddDays(1)), CancellationToken.None);

        var receiptRow = result.Single(r => r.Source == IrdPurchaseRegisterRowDto.DirectGoodsReceiptSource);
        receiptRow.TaxableAmount.ShouldBe(100m);
        receiptRow.ExemptAmount.ShouldBe(100m);
        receiptRow.VatAmount.ShouldBe(13m);
        receiptRow.TotalAmount.ShouldBe(213m);
        var orderRow = result.Single(r => r.Source == IrdPurchaseRegisterRowDto.PurchaseOrderSource);
        orderRow.TaxableAmount.ShouldBe(0m);
        orderRow.ExemptAmount.ShouldBe(50m);
    }

    [Fact]
    public async Task Debit_Note_Exempt_Amount_Should_Be_Negative_And_In_The_Total()
    {
        _mediator.Send(Arg.Any<FSH.Modules.Suppliers.Contracts.v1.Returns.GetSupplierDebitNotesQuery>(), Arg.Any<CancellationToken>())
            .Returns(new List<SupplierDebitNoteRegisterDto>
            {
                new(Guid.CreateVersion7(), DateTime.UtcNow, Guid.CreateVersion7(), "DN-1", null, 100m, 13m, null, ExemptAmount: 40m),
            });
        _mediator.Send(Arg.Any<GetSupplierByIdQuery>(), Arg.Any<CancellationToken>())
            .Returns<SupplierDto>(_ => throw new NotFoundException("not found"));

        var row = (await _sut.Handle(
            new GetIrdPurchaseRegisterQuery(DateTime.UtcNow.AddDays(-1), DateTime.UtcNow.AddDays(1)), CancellationToken.None))
            .ShouldHaveSingleItem();

        row.TaxableAmount.ShouldBe(-100m);
        row.ExemptAmount.ShouldBe(-40m);
        row.TotalAmount.ShouldBe(-153m);
    }

    [Fact]
    public async Task Handle_Should_Merge_Orders_And_Receipts_By_Date()
    {
        var now = DateTime.UtcNow;
        var order = ReceivedOrder(Guid.CreateVersion7(), now.AddDays(-3), now.AddDays(-2));
        _db.PurchaseOrders.Add(order);
        var receipt = DirectGoodsReceipt.Create(Guid.CreateVersion7(), now.AddDays(-1), null, "tester", Guid.CreateVersion7());
        receipt.AddLine(Guid.CreateVersion7(), 1m, 5m, 0m);
        _db.DirectGoodsReceipts.Add(receipt);
        await _db.SaveChangesAsync(CancellationToken.None);

        _mediator.Send(Arg.Any<GetSupplierByIdQuery>(), Arg.Any<CancellationToken>())
            .Returns<SupplierDto>(_ => throw new NotFoundException("not found"));

        var result = await _sut.Handle(new GetIrdPurchaseRegisterQuery(now.AddDays(-5), now), CancellationToken.None);

        result.Select(r => r.Source).ShouldBe([
            IrdPurchaseRegisterRowDto.PurchaseOrderSource,
            IrdPurchaseRegisterRowDto.DirectGoodsReceiptSource,
        ]);
    }

    public void Dispose() => _db.Dispose();
}
