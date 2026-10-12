using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.v1.Sales;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Sales.GetSaleById;
using FSH.Modules.Sales.Features.v1.Sales.SearchSales;
using Mediator;
using NSubstitute;

namespace Sales.Tests.Features.Sales;

/// <summary>
/// Server-side filters, search, sort and display enrichment of the sales list (GET /sales) and the
/// sale detail (GET /sales/{id}).
/// </summary>
public sealed class SearchSalesFiltersTests : IDisposable
{
    private readonly SalesDbContext _db = SalesDbContextFactory.Create();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly Guid _branchId = Guid.CreateVersion7();
    private readonly SearchSalesQueryHandler _sut;

    public SearchSalesFiltersTests()
    {
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>())
            .Returns(ci => ci.ArgAt<Guid?>(0) ?? _branchId);
        _sut = new SearchSalesQueryHandler(_db, _currentBranch, _mediator);
    }

    public void Dispose() => _db.Dispose();

    private static void SetSaleDate(Sale sale, DateTime utc) =>
        typeof(Sale).GetProperty(nameof(Sale.SaleDateUtc))!.SetValue(sale, utc);

    /// <summary>A completed sale of one line at <paramref name="total"/>, paid as given.</summary>
    private Sale AddSale(
        decimal total,
        decimal? paid = null,
        string method = "cash",
        Guid? customerId = null,
        string? notes = null,
        string? invoiceNumber = null,
        DateTime? saleDateUtc = null,
        Guid? medicineId = null)
    {
        var sale = Sale.StartBuilding(_branchId, customerId, null, notes);
        sale.AddItem(medicineId ?? Guid.CreateVersion7(), 1m, total, 0m, 0m, total / 2);
        sale.Finalize(method, paid ?? total);
        if (invoiceNumber is not null)
        {
            sale.AssignInvoice(invoiceNumber, 2083);
        }

        if (saleDateUtc is { } date)
        {
            SetSaleDate(sale, date);
        }

        _db.Sales.Add(sale);
        return sale;
    }

    private async Task<List<Guid>> SearchIdsAsync(SearchSalesQuery query)
    {
        await _db.SaveChangesAsync(CancellationToken.None);
        var result = await _sut.Handle(query, CancellationToken.None);
        return result.Items.Select(s => s.Id).ToList();
    }

    #region Search

    [Fact]
    public async Task Should_MatchInvoiceNumber_CaseInsensitively()
    {
        var match = AddSale(100m, invoiceNumber: "INV-MAIN-2083/84-00042");
        AddSale(100m, invoiceNumber: "INV-MAIN-2083/84-00043");

        var ids = await SearchIdsAsync(new SearchSalesQuery(Search: "inv-main-2083/84-00042"));

        ids.ShouldBe([match.Id]);
    }

    [Fact]
    public async Task Should_MatchSaleIdLabelPrefix()
    {
        var match = AddSale(100m);
        var other = AddSale(100m);
        string label = $"SALE-{match.Id.ToString("N")[..8].ToUpperInvariant()}";

        // v7 ids made within the same ~65 s share their first 8 hex digits, so a label can match
        // neighbours; the whole id narrows it to one sale.
        (await SearchIdsAsync(new SearchSalesQuery(Search: label))).ShouldContain(match.Id);
        (await SearchIdsAsync(new SearchSalesQuery(Search: match.Id.ToString()))).ShouldBe([match.Id]);
        (await SearchIdsAsync(new SearchSalesQuery(Search: "SALE-zzzz"))).ShouldNotContain(other.Id);
    }

    [Fact]
    public async Task Should_MatchNotes()
    {
        var match = AddSale(100m, notes: "Delivered to ward 4");
        AddSale(100m, notes: "Counter sale");

        var ids = await SearchIdsAsync(new SearchSalesQuery(Search: "WARD 4"));

        ids.ShouldBe([match.Id]);
    }

    [Fact]
    public async Task Should_MatchCustomerName_ThroughCustomersContracts()
    {
        var asha = Guid.CreateVersion7();
        var other = Guid.CreateVersion7();
        var match = AddSale(100m, paid: 100m, customerId: asha);
        AddSale(100m, paid: 100m, customerId: other);
        _mediator.Send(Arg.Is<LookupCustomersQuery>(q => q.Search == "asha"), Arg.Any<CancellationToken>())
            .Returns(new List<CustomerLookupDto> { new(asha, "Asha Thapa", "9800000000") });

        var ids = await SearchIdsAsync(new SearchSalesQuery(Search: "asha"));

        ids.ShouldBe([match.Id]);
    }

    [Fact]
    public async Task Should_ReturnNothing_When_SearchMatchesNoField()
    {
        AddSale(100m, invoiceNumber: "INV-1", notes: "hello");

        var ids = await SearchIdsAsync(new SearchSalesQuery(Search: "zzz-nothing"));

        ids.ShouldBeEmpty();
    }

    #endregion

    #region Medicine, customer, branch, status

    [Fact]
    public async Task Should_FilterBySalesContainingMedicine()
    {
        var paracetamol = Guid.CreateVersion7();
        var withIt = Sale.StartBuilding(_branchId, null, null, null);
        withIt.AddItem(Guid.CreateVersion7(), 1m, 10m, 0m, 0m, 5m);
        withIt.AddItem(paracetamol, 2m, 5m, 0m, 0m, 2m);
        withIt.Finalize("cash", 20m);
        _db.Sales.Add(withIt);
        AddSale(10m);

        var ids = await SearchIdsAsync(new SearchSalesQuery(MedicineId: paracetamol));

        ids.ShouldBe([withIt.Id]);
    }

    [Fact]
    public async Task Should_FilterByCustomer_Branch_And_SaleStatus()
    {
        var customer = Guid.CreateVersion7();
        var mine = AddSale(10m, customerId: customer);
        AddSale(10m, customerId: Guid.CreateVersion7());
        var cancelled = AddSale(10m);
        cancelled.Cancel("Duplicate");
        var otherBranchId = Guid.CreateVersion7();
        var elsewhere = Sale.StartBuilding(otherBranchId, null, null, null);
        elsewhere.AddItem(Guid.CreateVersion7(), 1m, 10m, 0m, 0m, 5m);
        elsewhere.Finalize("cash", 10m);
        _db.Sales.Add(elsewhere);

        (await SearchIdsAsync(new SearchSalesQuery(CustomerId: customer))).ShouldBe([mine.Id]);
        (await SearchIdsAsync(new SearchSalesQuery(BranchId: otherBranchId))).ShouldBe([elsewhere.Id]);
        (await SearchIdsAsync(new SearchSalesQuery())).ShouldNotContain(elsewhere.Id);
        (await SearchIdsAsync(new SearchSalesQuery(Status: "Cancelled"))).ShouldBe([cancelled.Id]);
    }

    [Fact]
    public async Task Should_PageResults_WithTotalCountOfAllMatches()
    {
        for (int i = 0; i < 5; i++)
        {
            AddSale(10m + i);
        }

        await _db.SaveChangesAsync(CancellationToken.None);
        var page2 = await _sut.Handle(new SearchSalesQuery(PageNumber: 2, PageSize: 2, SortBy: "total_amount", SortOrder: "asc"), CancellationToken.None);

        page2.TotalCount.ShouldBe(5);
        page2.TotalPages.ShouldBe(3);
        page2.Items.Select(s => s.TotalAmount).ShouldBe([12m, 13m]);
    }

    #endregion

    #region Payment status

    [Fact]
    public async Task Should_FilterPaidAndPending_ByBalanceDue_ExcludingCancelled()
    {
        var customer = Guid.CreateVersion7();
        var paid = AddSale(100m, customerId: customer);
        var pending = AddSale(200m, paid: 50m, customerId: customer);
        var cancelled = AddSale(300m, customerId: customer);
        cancelled.Cancel("Wrong item");

        (await SearchIdsAsync(new SearchSalesQuery(PaymentStatuses: ["paid"]))).ShouldBe([paid.Id]);
        (await SearchIdsAsync(new SearchSalesQuery(PaymentStatuses: ["completed"]))).ShouldBe([paid.Id]);
        (await SearchIdsAsync(new SearchSalesQuery(PaymentStatuses: ["pending"]))).ShouldBe([pending.Id]);
        (await SearchIdsAsync(new SearchSalesQuery(PaymentStatuses: ["cancelled"]))).ShouldBe([cancelled.Id]);
        (await SearchIdsAsync(new SearchSalesQuery(PaymentStatuses: ["paid,pending"]))).Count.ShouldBe(2);
    }

    [Fact]
    public async Task Should_MatchRefunded_When_SaleHasCompletedRefund()
    {
        var refundedSale = AddSale(100m);
        var pendingRefundSale = AddSale(100m);
        AddSale(100m);
        _db.SaleRefunds.Add(SaleRefund.Create(
            _branchId, refundedSale.Id, null, DateTime.UtcNow, RefundStatus.Completed, "Damaged", "full_refund", "cash", 0m, null));
        _db.SaleRefunds.Add(SaleRefund.Create(
            _branchId, pendingRefundSale.Id, null, DateTime.UtcNow, RefundStatus.Pending, "Damaged", "full_refund", "cash", 0m, null));

        var ids = await SearchIdsAsync(new SearchSalesQuery(PaymentStatuses: ["refunded"]));

        ids.ShouldBe([refundedSale.Id]);
    }

    [Fact]
    public async Task Should_MatchNothing_For_FailedStatus()
    {
        AddSale(100m);

        var ids = await SearchIdsAsync(new SearchSalesQuery(PaymentStatuses: ["failed"]));

        ids.ShouldBeEmpty();
    }

    #endregion

    #region Payment method

    [Fact]
    public async Task Should_FilterBySinglePaymentMethod_CaseInsensitively()
    {
        var cash = AddSale(100m, method: "Cash");
        AddSale(100m, method: "card");

        var ids = await SearchIdsAsync(new SearchSalesQuery(PaymentMethods: ["cash"]));

        ids.ShouldBe([cash.Id]);
    }

    [Fact]
    public async Task Should_FilterByMultiplePaymentMethods()
    {
        var cash = AddSale(100m, method: "cash");
        var card = AddSale(100m, method: "card");
        AddSale(100m, method: "esewa");

        var ids = await SearchIdsAsync(new SearchSalesQuery(PaymentMethods: ["cash", "card"]));

        ids.ShouldBe([cash.Id, card.Id], ignoreOrder: true);
    }

    [Fact]
    public async Task Should_MatchSplitTenderSale_ByMixed_AndByOneOfItsLegs()
    {
        var split = Sale.StartBuilding(_branchId, null, null, null);
        split.AddItem(Guid.CreateVersion7(), 1m, 100m, 0m, 0m, 50m);
        split.Finalize([new SaleTender("cash", 60m, null), new SaleTender("fonepay", 40m, "FP-1")], shortfallIsOnAccount: false);
        _db.Sales.Add(split);
        var card = AddSale(100m, method: "card");

        (await SearchIdsAsync(new SearchSalesQuery(PaymentMethods: ["mixed"]))).ShouldBe([split.Id]);
        (await SearchIdsAsync(new SearchSalesQuery(PaymentMethods: ["fonepay"]))).ShouldBe([split.Id]);
        (await SearchIdsAsync(new SearchSalesQuery(PaymentMethods: ["card"]))).ShouldBe([card.Id]);
    }

    #endregion

    #region Amount and dates

    [Fact]
    public async Task Should_FilterByTotalAmountRange_Inclusive()
    {
        AddSale(50m);
        var hundred = AddSale(100m);
        var twoHundred = AddSale(200m);
        AddSale(250m);

        var ids = await SearchIdsAsync(new SearchSalesQuery(MinAmount: 100m, MaxAmount: 200m));

        ids.ShouldBe([hundred.Id, twoHundred.Id], ignoreOrder: true);
    }

    [Fact]
    public async Task Should_UseLineDiscounts_When_FilteringByTotal()
    {
        var sale = Sale.StartBuilding(_branchId, null, null, null);
        sale.AddItem(Guid.CreateVersion7(), 2m, 100m, 30m, 0m, 50m); // 200 - 30 = 170
        sale.Finalize("cash", 170m);
        _db.Sales.Add(sale);

        (await SearchIdsAsync(new SearchSalesQuery(MinAmount: 171m))).ShouldBeEmpty();
        (await SearchIdsAsync(new SearchSalesQuery(MinAmount: 170m, MaxAmount: 170m))).ShouldBe([sale.Id]);
    }

    [Fact]
    public async Task Should_FilterByWholeNepalDays_Inclusive()
    {
        // 2026-10-05 in Nepal runs from 2026-10-04T18:15Z to 2026-10-05T18:15Z.
        var beforeStart = AddSale(10m, saleDateUtc: new DateTime(2026, 10, 4, 18, 14, 0, DateTimeKind.Utc));
        var atStart = AddSale(10m, saleDateUtc: new DateTime(2026, 10, 4, 18, 15, 0, DateTimeKind.Utc));
        var lateEvening = AddSale(10m, saleDateUtc: new DateTime(2026, 10, 5, 18, 14, 59, DateTimeKind.Utc));
        var nextDay = AddSale(10m, saleDateUtc: new DateTime(2026, 10, 5, 18, 15, 0, DateTimeKind.Utc));

        var ids = await SearchIdsAsync(new SearchSalesQuery(FromDate: new DateOnly(2026, 10, 5), ToDate: new DateOnly(2026, 10, 5)));

        ids.ShouldBe([atStart.Id, lateEvening.Id], ignoreOrder: true);
        ids.ShouldNotContain(beforeStart.Id);
        ids.ShouldNotContain(nextDay.Id);
    }

    #endregion

    #region Sort

    [Fact]
    public async Task Should_SortByTotalAmount_BothDirections()
    {
        var mid = AddSale(150m);
        var low = AddSale(50m);
        var high = AddSale(300m);

        (await SearchIdsAsync(new SearchSalesQuery(SortBy: "total_amount", SortOrder: "asc"))).ShouldBe([low.Id, mid.Id, high.Id]);
        (await SearchIdsAsync(new SearchSalesQuery(SortBy: "total_amount", SortOrder: "desc"))).ShouldBe([high.Id, mid.Id, low.Id]);
    }

    [Fact]
    public async Task Should_SortBySaleDate_Ascending_When_Asked()
    {
        var newest = AddSale(10m, saleDateUtc: DateTime.UtcNow);
        var oldest = AddSale(10m, saleDateUtc: DateTime.UtcNow.AddDays(-3));
        var middle = AddSale(10m, saleDateUtc: DateTime.UtcNow.AddDays(-1));

        (await SearchIdsAsync(new SearchSalesQuery(SortBy: "sale_date", SortOrder: "asc"))).ShouldBe([oldest.Id, middle.Id, newest.Id]);
        (await SearchIdsAsync(new SearchSalesQuery())).ShouldBe([newest.Id, middle.Id, oldest.Id]);
    }

    [Fact]
    public async Task Should_SortByInvoiceNumber()
    {
        var b = AddSale(10m, invoiceNumber: "INV-B");
        var a = AddSale(10m, invoiceNumber: "INV-A");
        var c = AddSale(10m, invoiceNumber: "INV-C");

        (await SearchIdsAsync(new SearchSalesQuery(SortBy: "invoice_number", SortOrder: "asc"))).ShouldBe([a.Id, b.Id, c.Id]);
    }

    [Fact]
    public async Task Should_SortByBalanceDue_Descending()
    {
        var customer = Guid.CreateVersion7();
        var small = AddSale(100m, paid: 90m, customerId: customer);
        var large = AddSale(100m, paid: 10m, customerId: customer);
        var none = AddSale(100m, customerId: customer);

        (await SearchIdsAsync(new SearchSalesQuery(SortBy: "balance_due", SortOrder: "desc"))).ShouldBe([large.Id, small.Id, none.Id]);
    }

    #endregion

    #region Enrichment

    [Fact]
    public async Task SearchSales_Should_FillMedicineAndCustomerDisplayFields()
    {
        var customerId = Guid.CreateVersion7();
        var medicineId = Guid.CreateVersion7();
        AddSale(100m, customerId: customerId, medicineId: medicineId);
        await _db.SaveChangesAsync(CancellationToken.None);
        _mediator.Send(Arg.Any<GetMedicineSummariesQuery>(), Arg.Any<CancellationToken>())
            .Returns(new List<MedicineSummaryDto> { new(medicineId, "Paracetamol", "Acetaminophen", "500mg", "Tablet") });
        _mediator.Send(Arg.Is<LookupCustomersQuery>(q => q.CustomerIds != null), Arg.Any<CancellationToken>())
            .Returns(new List<CustomerLookupDto> { new(customerId, "Asha Thapa", "9800000000") });

        var result = await _sut.Handle(new SearchSalesQuery(), CancellationToken.None);

        var dto = result.Items.ShouldHaveSingleItem();
        dto.CustomerName.ShouldBe("Asha Thapa");
        dto.CustomerPhone.ShouldBe("9800000000");
        var item = dto.Items.ShouldHaveSingleItem();
        item.MedicineName.ShouldBe("Paracetamol");
        item.MedicineGenericName.ShouldBe("Acetaminophen");
        item.MedicineStrength.ShouldBe("500mg");
        item.MedicineForm.ShouldBe("Tablet");
    }

    [Fact]
    public async Task GetSaleById_Should_FillMedicineNames_And_LeaveUnknownMedicinesNull()
    {
        var known = Guid.CreateVersion7();
        var unknown = Guid.CreateVersion7();
        var sale = Sale.StartBuilding(_branchId, null, null, null);
        sale.AddItem(known, 1m, 10m, 0m, 0m, 5m);
        sale.AddItem(unknown, 1m, 20m, 0m, 0m, 5m);
        sale.Finalize("cash", 30m);
        _db.Sales.Add(sale);
        await _db.SaveChangesAsync(CancellationToken.None);
        _mediator.Send(Arg.Any<GetMedicineSummariesQuery>(), Arg.Any<CancellationToken>())
            .Returns(new List<MedicineSummaryDto> { new(known, "Amoxicillin", null, "250mg", "Capsule") });
        var sut = new GetSaleByIdQueryHandler(_db, _mediator, Substitute.For<FSH.Modules.Multitenancy.Contracts.ICurrentBranch>());

        var dto = await sut.Handle(new GetSaleByIdQuery(sale.Id), CancellationToken.None);

        dto.CustomerName.ShouldBeNull();
        dto.Items.Single(i => i.MedicineId == known).MedicineName.ShouldBe("Amoxicillin");
        dto.Items.Single(i => i.MedicineId == known).MedicineStrength.ShouldBe("250mg");
        dto.Items.Single(i => i.MedicineId == unknown).MedicineName.ShouldBeNull();
        await _mediator.Received(1).Send(
            Arg.Is<GetMedicineSummariesQuery>(q => q.MedicineIds.Count == 2), Arg.Any<CancellationToken>());
        await _mediator.DidNotReceive().Send(Arg.Any<LookupCustomersQuery>(), Arg.Any<CancellationToken>());
    }

    #endregion
}
