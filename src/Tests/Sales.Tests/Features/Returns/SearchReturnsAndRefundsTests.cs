using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.v1.Refunds;
using FSH.Modules.Sales.Contracts.v1.Returns;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Refunds.GetRefundById;
using FSH.Modules.Sales.Features.v1.Refunds.SearchRefunds;
using FSH.Modules.Sales.Features.v1.Returns.GetReturnById;
using FSH.Modules.Sales.Features.v1.Returns.SearchReturns;
using Mediator;
using NSubstitute;

namespace Sales.Tests.Features.Returns;

/// <summary>Search text, sort, amount bounds and display enrichment of the returns and refunds lists.</summary>
public sealed class SearchReturnsAndRefundsTests : IDisposable
{
    private readonly SalesDbContext _db = SalesDbContextFactory.Create();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly Guid _branchId = Guid.CreateVersion7();

    public SearchReturnsAndRefundsTests()
    {
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>())
            .Returns(ci => ci.ArgAt<Guid?>(0) ?? _branchId);
    }

    public void Dispose() => _db.Dispose();

    private Sale AddSale(string? invoiceNumber = null)
    {
        var sale = Sale.StartBuilding(_branchId, null, null, null);
        sale.AddItem(Guid.CreateVersion7(), 5m, 100m, 0m, 0m, 50m);
        sale.Finalize("cash", 500m);
        if (invoiceNumber is not null)
        {
            sale.AssignInvoice(invoiceNumber, 2083);
        }

        _db.Sales.Add(sale);
        return sale;
    }

    private SaleReturn AddReturn(
        Guid saleId, decimal quantity, decimal unitPrice, string reason = "Expired", Guid? customerId = null,
        Guid? medicineId = null, DateTime? createdAtUtc = null)
    {
        var r = SaleReturn.Create(_branchId, saleId, customerId, DateTime.UtcNow, ReturnStatus.Pending, reason, null);
        r.AddItem(Guid.CreateVersion7(), medicineId ?? Guid.CreateVersion7(), quantity, unitPrice, unitPrice / 2, reason, PackagingCondition.Sealed);
        if (createdAtUtc is { } created)
        {
            typeof(SaleReturn).GetProperty(nameof(SaleReturn.CreatedAtUtc))!.SetValue(r, created);
        }

        _db.SaleReturns.Add(r);
        return r;
    }

    private SaleRefund AddRefund(
        Guid saleId, decimal quantity, decimal unitPrice, string refundNumber, decimal tax = 0m, decimal fee = 0m,
        Guid? customerId = null, Guid? medicineId = null)
    {
        var r = SaleRefund.Create(_branchId, saleId, customerId, DateTime.UtcNow, RefundStatus.Pending, "Customer request",
            "partial_refund", "cash", tax, fee, null);
        r.AddItem(Guid.CreateVersion7(), medicineId ?? Guid.CreateVersion7(), quantity, unitPrice);
        typeof(SaleRefund).GetProperty(nameof(SaleRefund.RefundNumber))!.SetValue(r, refundNumber);
        _db.SaleRefunds.Add(r);
        return r;
    }

    private async Task<List<Guid>> ReturnIdsAsync(SearchReturnsQuery query)
    {
        await _db.SaveChangesAsync(CancellationToken.None);
        var result = await new SearchReturnsQueryHandler(_db, _currentBranch, _mediator).Handle(query, CancellationToken.None);
        return result.Items.Select(r => r.Id).ToList();
    }

    private async Task<List<Guid>> RefundIdsAsync(SearchRefundsQuery query)
    {
        await _db.SaveChangesAsync(CancellationToken.None);
        var result = await new SearchRefundsQueryHandler(_db, _currentBranch, _mediator).Handle(query, CancellationToken.None);
        return result.Items.Select(r => r.Id).ToList();
    }

    #region Returns

    [Fact]
    public async Task Returns_Should_MatchReason_SaleInvoice_And_ReturnLabel()
    {
        var invoiced = AddSale("INV-MAIN-2083/84-00007");
        var plain = AddSale();
        var byReason = AddReturn(plain.Id, 1m, 10m, reason: "Wrong strength dispensed");
        var byInvoice = AddReturn(invoiced.Id, 1m, 10m);
        var byLabel = AddReturn(plain.Id, 1m, 10m);

        (await ReturnIdsAsync(new SearchReturnsQuery(Search: "wrong strength"))).ShouldBe([byReason.Id]);
        (await ReturnIdsAsync(new SearchReturnsQuery(Search: "00007"))).ShouldBe([byInvoice.Id]);
        string label = $"RET-{byLabel.Id.ToString("N")[..8].ToUpperInvariant()}";
        (await ReturnIdsAsync(new SearchReturnsQuery(Search: label))).ShouldContain(byLabel.Id);
    }

    [Fact]
    public async Task Returns_Should_MatchCustomerName()
    {
        var sale = AddSale();
        var customer = Guid.CreateVersion7();
        var match = AddReturn(sale.Id, 1m, 10m, customerId: customer);
        AddReturn(sale.Id, 1m, 10m, customerId: Guid.CreateVersion7());
        _mediator.Send(Arg.Is<LookupCustomersQuery>(q => q.Search == "ram"), Arg.Any<CancellationToken>())
            .Returns(new List<CustomerLookupDto> { new(customer, "Ram Bahadur", null) });

        (await ReturnIdsAsync(new SearchReturnsQuery(Search: "ram"))).ShouldBe([match.Id]);
    }

    [Fact]
    public async Task Returns_Should_FilterByAmount_And_SortByTotal_InTheDatabaseQuery()
    {
        var sale = AddSale();
        var small = AddReturn(sale.Id, 1m, 10m);   // 10
        var medium = AddReturn(sale.Id, 2m, 25m);  // 50
        var large = AddReturn(sale.Id, 4m, 50m);   // 200

        (await ReturnIdsAsync(new SearchReturnsQuery(MinAmount: 20m, MaxAmount: 100m))).ShouldBe([medium.Id]);
        (await ReturnIdsAsync(new SearchReturnsQuery(SortBy: "total_return_amount", SortOrder: "asc"))).ShouldBe([small.Id, medium.Id, large.Id]);
        (await ReturnIdsAsync(new SearchReturnsQuery(SortBy: "total_return_amount", SortOrder: "desc"))).ShouldBe([large.Id, medium.Id, small.Id]);
    }

    [Fact]
    public async Task Returns_Should_SortByCreatedAt()
    {
        var sale = AddSale();
        var older = AddReturn(sale.Id, 1m, 10m, createdAtUtc: DateTime.UtcNow.AddDays(-2));
        var newer = AddReturn(sale.Id, 1m, 10m, createdAtUtc: DateTime.UtcNow);

        (await ReturnIdsAsync(new SearchReturnsQuery(SortBy: "created_at", SortOrder: "asc"))).ShouldBe([older.Id, newer.Id]);
        (await ReturnIdsAsync(new SearchReturnsQuery(SortBy: "created_at", SortOrder: "desc"))).ShouldBe([newer.Id, older.Id]);
    }

    [Fact]
    public async Task Returns_Should_FillMedicineCustomerAndInvoice()
    {
        var sale = AddSale("INV-9");
        var medicineId = Guid.CreateVersion7();
        var customer = Guid.CreateVersion7();
        var r = AddReturn(sale.Id, 1m, 10m, customerId: customer, medicineId: medicineId);
        await _db.SaveChangesAsync(CancellationToken.None);
        _mediator.Send(Arg.Any<GetMedicineSummariesQuery>(), Arg.Any<CancellationToken>())
            .Returns(new List<MedicineSummaryDto> { new(medicineId, "Cetirizine", null, "10mg", "Tablet") });
        _mediator.Send(Arg.Is<LookupCustomersQuery>(q => q.CustomerIds != null), Arg.Any<CancellationToken>())
            .Returns(new List<CustomerLookupDto> { new(customer, "Sita Rai", null) });

        var listed = (await new SearchReturnsQueryHandler(_db, _currentBranch, _mediator)
            .Handle(new SearchReturnsQuery(), CancellationToken.None)).Items.ShouldHaveSingleItem();
        var single = await new GetReturnByIdQueryHandler(_db, _mediator, Substitute.For<FSH.Modules.Multitenancy.Contracts.ICurrentBranch>()).Handle(new GetReturnByIdQuery(r.Id), CancellationToken.None);

        foreach (var dto in new[] { listed, single })
        {
            dto.CustomerName.ShouldBe("Sita Rai");
            dto.SaleInvoiceNumber.ShouldBe("INV-9");
            dto.Items.ShouldHaveSingleItem().MedicineName.ShouldBe("Cetirizine");
            dto.Items[0].MedicineStrength.ShouldBe("10mg");
        }
    }

    #endregion

    #region Refunds

    [Fact]
    public async Task Refunds_Should_MatchRefundNumber_And_OriginalInvoice()
    {
        var invoiced = AddSale("INV-MAIN-2083/84-00099");
        var plain = AddSale();
        var byNumber = AddRefund(plain.Id, 1m, 10m, "REF-1111");
        var byInvoice = AddRefund(invoiced.Id, 1m, 10m, "REF-2222");

        (await RefundIdsAsync(new SearchRefundsQuery(Search: "ref-1111"))).ShouldBe([byNumber.Id]);
        (await RefundIdsAsync(new SearchRefundsQuery(Search: "00099"))).ShouldBe([byInvoice.Id]);
    }

    [Fact]
    public async Task Refunds_Should_FilterAndSortByNetAmount()
    {
        var sale = AddSale();
        var net45 = AddRefund(sale.Id, 5m, 10m, "REF-A", fee: 5m);    // 50 - 5
        var net110 = AddRefund(sale.Id, 5m, 20m, "REF-B", tax: 10m);  // 100 + 10
        var net20 = AddRefund(sale.Id, 2m, 10m, "REF-C");             // 20

        (await RefundIdsAsync(new SearchRefundsQuery(MinAmount: 45m, MaxAmount: 100m))).ShouldBe([net45.Id]);
        (await RefundIdsAsync(new SearchRefundsQuery(SortBy: "net_refund_amount", SortOrder: "desc"))).ShouldBe([net110.Id, net45.Id, net20.Id]);
        (await RefundIdsAsync(new SearchRefundsQuery(SortBy: "refund_number", SortOrder: "asc"))).ShouldBe([net45.Id, net110.Id, net20.Id]);
    }

    [Fact]
    public async Task Refunds_Should_FillMedicineAndCustomerNames()
    {
        var sale = AddSale("INV-5");
        var medicineId = Guid.CreateVersion7();
        var customer = Guid.CreateVersion7();
        var r = AddRefund(sale.Id, 1m, 10m, "REF-X", customerId: customer, medicineId: medicineId);
        await _db.SaveChangesAsync(CancellationToken.None);
        _mediator.Send(Arg.Any<GetMedicineSummariesQuery>(), Arg.Any<CancellationToken>())
            .Returns(new List<MedicineSummaryDto> { new(medicineId, "ORS", null, null, "Powder") });
        _mediator.Send(Arg.Is<LookupCustomersQuery>(q => q.CustomerIds != null), Arg.Any<CancellationToken>())
            .Returns(new List<CustomerLookupDto> { new(customer, "Hari KC", null) });

        var listed = (await new SearchRefundsQueryHandler(_db, _currentBranch, _mediator)
            .Handle(new SearchRefundsQuery(), CancellationToken.None)).Items.ShouldHaveSingleItem();
        var single = await new GetRefundByIdQueryHandler(_db, _mediator, Substitute.For<FSH.Modules.Multitenancy.Contracts.ICurrentBranch>()).Handle(new GetRefundByIdQuery(r.Id), CancellationToken.None);

        foreach (var dto in new[] { listed, single })
        {
            dto.CustomerName.ShouldBe("Hari KC");
            dto.OriginalInvoiceNumber.ShouldBe("INV-5");
            dto.Items.ShouldHaveSingleItem().MedicineName.ShouldBe("ORS");
            dto.Items[0].MedicineForm.ShouldBe("Powder");
        }
    }

    #endregion
}
