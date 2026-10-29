using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.v1.DirectGoodsReceipts;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using FSH.Modules.Purchasing.Features.v1.DirectGoodsReceipts.ListDirectGoodsReceipts;
using NSubstitute;
using Purchasing.Tests.Features;

namespace Purchasing.Tests.Features.DirectGoodsReceipts;

public sealed class ListDirectGoodsReceiptsQueryHandlerTests : IDisposable
{
    private readonly PurchasingDbContext _db = PurchasingDbContextFactory.Create();
    private readonly ListDirectGoodsReceiptsQueryHandler _sut;

    public ListDirectGoodsReceiptsQueryHandlerTests()
    {
        // No tenant branch resolved: an omitted branchId must stay unfiltered (see
        // ListDirectGoodsReceiptsDefaultBranchTests for the current-branch default).
        var currentBranch = Substitute.For<ICurrentBranch>();
        currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0));
        _sut = new ListDirectGoodsReceiptsQueryHandler(_db, currentBranch, NamesMediator.Create());
    }

    private async Task<(Guid BranchA, Guid BranchB)> SeedTwoBranchesAsync()
    {
        var branchA = Guid.CreateVersion7();
        var branchB = Guid.CreateVersion7();

        var receiptA = DirectGoodsReceipt.Create(Guid.CreateVersion7(), DateTime.UtcNow, "A-1", "clerk1", branchA);
        receiptA.AddLine(Guid.CreateVersion7(), 5m, 2m, 0m);

        var receiptB = DirectGoodsReceipt.Create(Guid.CreateVersion7(), DateTime.UtcNow, "B-1", "clerk2", branchB);
        receiptB.AddLine(Guid.CreateVersion7(), 5m, 2m, 0m);

        _db.DirectGoodsReceipts.AddRange(receiptA, receiptB);
        await _db.SaveChangesAsync(CancellationToken.None);

        return (branchA, branchB);
    }

    #region Happy Path

    [Fact]
    public async Task Handle_Should_Return_AllReceipts_When_BranchId_Omitted()
    {
        await SeedTwoBranchesAsync();

        var result = await _sut.Handle(new ListDirectGoodsReceiptsQuery(), CancellationToken.None);

        result.Items.Count.ShouldBe(2);
    }

    [Fact]
    public async Task Handle_Should_FilterByBranch_When_BranchId_Provided()
    {
        var (branchA, _) = await SeedTwoBranchesAsync();

        var result = await _sut.Handle(new ListDirectGoodsReceiptsQuery(branchA), CancellationToken.None);

        result.Items.Count.ShouldBe(1);
        result.Items.First().BranchId.ShouldBe(branchA);
    }

    [Fact]
    public async Task Handle_Should_Page_On_The_Server_And_Report_The_Full_Count()
    {
        var branch = Guid.CreateVersion7();
        for (int i = 0; i < 5; i++)
        {
            var receipt = DirectGoodsReceipt.Create(Guid.CreateVersion7(), DateTime.UtcNow.AddDays(-i), $"R-{i}", "clerk1", branch);
            receipt.AddLine(Guid.CreateVersion7(), 1m, 2m, 0m);
            _db.DirectGoodsReceipts.Add(receipt);
        }

        await _db.SaveChangesAsync(CancellationToken.None);

        var page2 = await _sut.Handle(new ListDirectGoodsReceiptsQuery(branch, PageNumber: 2, PageSize: 2), CancellationToken.None);

        page2.TotalCount.ShouldBe(5);
        page2.TotalPages.ShouldBe(3);
        page2.Items.Select(r => r.SupplierInvoiceNumber).ShouldBe(["R-2", "R-3"]);
    }

    [Fact]
    public async Task Handle_Should_Filter_By_Status_And_Search_On_The_Server()
    {
        var branch = Guid.CreateVersion7();
        var kept = DirectGoodsReceipt.Create(Guid.CreateVersion7(), DateTime.UtcNow, "INV-KEEP", "clerk1", branch);
        kept.AddLine(Guid.CreateVersion7(), 1m, 2m, 0m);
        var voided = DirectGoodsReceipt.Create(Guid.CreateVersion7(), DateTime.UtcNow, "INV-KEEP-2", "clerk1", branch);
        voided.AddLine(Guid.CreateVersion7(), 1m, 2m, 0m);
        voided.Void("manager1", "wrong");
        var other = DirectGoodsReceipt.Create(Guid.CreateVersion7(), DateTime.UtcNow, "OTHER", "clerk1", branch);
        other.AddLine(Guid.CreateVersion7(), 1m, 2m, 0m);
        _db.DirectGoodsReceipts.AddRange(kept, voided, other);
        await _db.SaveChangesAsync(CancellationToken.None);

        var result = await _sut.Handle(new ListDirectGoodsReceiptsQuery(branch, Status: "received", Search: "keep"), CancellationToken.None);

        result.TotalCount.ShouldBe(1);
        result.Items.Single().SupplierInvoiceNumber.ShouldBe("INV-KEEP");
    }

    [Fact]
    public async Task Handle_Should_Filter_By_Source_Supplier_And_Receipt_Date()
    {
        var branch = Guid.CreateVersion7();
        var supplier = Guid.CreateVersion7();
        var today = new DateTime(2026, 10, 20, 6, 0, 0, DateTimeKind.Utc);

        var bill = DirectGoodsReceipt.Create(supplier, today, "BILL", "clerk1", branch);
        bill.AddLine(Guid.CreateVersion7(), 1m, 2m, 0m);
        var delivery = DirectGoodsReceipt.Create(supplier, today, "PO-BILL", "clerk1", branch, purchaseOrderId: Guid.CreateVersion7());
        delivery.AddLine(Guid.CreateVersion7(), 1m, 2m, 0m);
        var stockEntry = DirectGoodsReceipt.Create(supplier, today, "ENTRY", "clerk1", branch, source: GoodsReceiptSource.StockEntry);
        stockEntry.AddLine(Guid.CreateVersion7(), 1m, 2m, 0m);
        var otherSupplier = DirectGoodsReceipt.Create(Guid.CreateVersion7(), today, "OTHER", "clerk1", branch);
        otherSupplier.AddLine(Guid.CreateVersion7(), 1m, 2m, 0m);
        var lastMonth = DirectGoodsReceipt.Create(supplier, today.AddDays(-30), "OLD", "clerk1", branch);
        lastMonth.AddLine(Guid.CreateVersion7(), 1m, 2m, 0m);
        _db.DirectGoodsReceipts.AddRange(bill, delivery, stockEntry, otherSupplier, lastMonth);
        await _db.SaveChangesAsync(CancellationToken.None);

        var orders = await _sut.Handle(new ListDirectGoodsReceiptsQuery(branch, Source: "purchaseorder"), CancellationToken.None);
        orders.Items.Single().SupplierInvoiceNumber.ShouldBe("PO-BILL");
        orders.Items.Single().Source.ShouldBe("PurchaseOrder");

        var entries = await _sut.Handle(new ListDirectGoodsReceiptsQuery(branch, Source: "StockEntry"), CancellationToken.None);
        entries.Items.Single().SupplierInvoiceNumber.ShouldBe("ENTRY");

        var thisWeekFromSupplier = await _sut.Handle(
            new ListDirectGoodsReceiptsQuery(branch, SupplierId: supplier, DateFromUtc: today.AddDays(-7), DateToUtc: today.AddHours(1)),
            CancellationToken.None);
        thisWeekFromSupplier.Items.Select(r => r.SupplierInvoiceNumber).Order().ShouldBe(["BILL", "ENTRY", "PO-BILL"]);
    }

    [Fact]
    public void Validator_Should_Reject_An_Unknown_Source_Or_A_Reversed_Date_Range()
    {
        var validator = new ListDirectGoodsReceiptsQueryValidator();
        var day = new DateTime(2026, 10, 20, 0, 0, 0, DateTimeKind.Utc);

        validator.Validate(new ListDirectGoodsReceiptsQuery(Source: "Gift")).IsValid.ShouldBeFalse();
        validator.Validate(new ListDirectGoodsReceiptsQuery(DateFromUtc: day, DateToUtc: day.AddDays(-1))).IsValid.ShouldBeFalse();
        validator.Validate(new ListDirectGoodsReceiptsQuery(Source: "all", DateFromUtc: day, DateToUtc: day)).IsValid.ShouldBeTrue();
    }

    [Fact]
    public void Validator_Should_Reject_An_Oversized_Page()
    {
        var validator = new ListDirectGoodsReceiptsQueryValidator();

        validator.Validate(new ListDirectGoodsReceiptsQuery(PageSize: 500)).IsValid.ShouldBeFalse();
        validator.Validate(new ListDirectGoodsReceiptsQuery(PageNumber: 0)).IsValid.ShouldBeFalse();
        validator.Validate(new ListDirectGoodsReceiptsQuery()).IsValid.ShouldBeTrue();
    }

    #endregion

    public void Dispose() => _db.Dispose();
}
