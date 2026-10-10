using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using FSH.Modules.Purchasing.Features.v1.PurchaseOrders.GetPurchaseOrderStatusCounts;
using FSH.Modules.Purchasing.Features.v1.PurchaseOrders.SearchPurchaseOrders;
using NSubstitute;

namespace Purchasing.Tests.Features.PurchaseOrders;

public sealed class SearchPurchaseOrdersQueryHandlerTests : IDisposable
{
    private static readonly Guid Himal = Guid.CreateVersion7();
    private static readonly Guid Nepal = Guid.CreateVersion7();
    private static readonly Guid Paracetamol = Guid.CreateVersion7();

    private readonly PurchasingDbContext _db = PurchasingDbContextFactory.Create();
    private readonly SearchPurchaseOrdersQueryHandler _sut;

    /// <summary>A caller with access to every branch: the requested branch filter is used as given.</summary>
    private static FSH.Modules.Multitenancy.Contracts.ICurrentBranch AllBranches()
    {
        var branch = Substitute.For<FSH.Modules.Multitenancy.Contracts.ICurrentBranch>();
        branch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0));
        branch.CanViewAllBranchesAsync(Arg.Any<CancellationToken>()).Returns(true);
        return branch;
    }

    public SearchPurchaseOrdersQueryHandlerTests()
    {
        var mediator = NamesMediator.Create(
            new Dictionary<Guid, string> { [Himal] = "Himal Pharma", [Nepal] = "Nepal Drug House" },
            new Dictionary<Guid, string> { [Paracetamol] = "Paracetamol 500mg" });
        _sut = new SearchPurchaseOrdersQueryHandler(_db, mediator, AllBranches());
    }

    private static PurchaseOrder Order(Guid supplierId, PurchaseOrderStatus status, string? invoice = null, string? narration = null)
    {
        var order = PurchaseOrder.CreateDraft(supplierId, DateTime.UtcNow, narration, invoice);
        order.AddLine(Paracetamol, "B1", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 10m, 2m, 3m, null);
        switch (status)
        {
            case PurchaseOrderStatus.Approved:
                order.Approve("manager");
                break;
            case PurchaseOrderStatus.Received:
                order.Approve("manager");
                order.Receive("clerk");
                break;
            case PurchaseOrderStatus.Cancelled:
                order.Cancel("not needed");
                break;
        }

        return order;
    }

    private async Task SeedAsync(params PurchaseOrder[] orders)
    {
        _db.PurchaseOrders.AddRange(orders);
        await _db.SaveChangesAsync(CancellationToken.None);
    }

    [Fact]
    public async Task Handle_Should_Fill_Supplier_And_Medicine_Names()
    {
        await SeedAsync(Order(Himal, PurchaseOrderStatus.Draft));

        var result = await _sut.Handle(new SearchPurchaseOrdersQuery(), CancellationToken.None);

        var dto = result.Items.ShouldHaveSingleItem();
        dto.SupplierName.ShouldBe("Himal Pharma");
        dto.Lines.Single().MedicineName.ShouldBe("Paracetamol 500mg");
    }

    [Fact]
    public async Task Handle_Should_Filter_By_A_Comma_Separated_Status_List()
    {
        await SeedAsync(
            Order(Himal, PurchaseOrderStatus.Draft),
            Order(Himal, PurchaseOrderStatus.Approved),
            Order(Himal, PurchaseOrderStatus.Received),
            Order(Himal, PurchaseOrderStatus.Cancelled));

        var open = await _sut.Handle(new SearchPurchaseOrdersQuery(Status: "Draft,Approved"), CancellationToken.None);
        var received = await _sut.Handle(new SearchPurchaseOrdersQuery(Status: "received"), CancellationToken.None);

        open.TotalCount.ShouldBe(2);
        open.Items.Select(o => o.Status).ShouldBe(["Draft", "Approved"], ignoreOrder: true);
        received.Items.ShouldHaveSingleItem().Status.ShouldBe("Received");
    }

    [Fact]
    public async Task Handle_Should_Search_By_Supplier_Name_Server_Side()
    {
        await SeedAsync(Order(Himal, PurchaseOrderStatus.Draft), Order(Nepal, PurchaseOrderStatus.Draft));

        var result = await _sut.Handle(new SearchPurchaseOrdersQuery(Search: "nepal"), CancellationToken.None);

        result.TotalCount.ShouldBe(1);
        result.Items.Single().SupplierName.ShouldBe("Nepal Drug House");
    }

    [Fact]
    public async Task Handle_Should_Search_By_Invoice_Number_Narration_And_Order_Id_Prefix()
    {
        var byInvoice = Order(Himal, PurchaseOrderStatus.Draft, invoice: "INV-2026-77");
        var byNarration = Order(Himal, PurchaseOrderStatus.Draft, narration: "Dashain restock");
        var other = Order(Himal, PurchaseOrderStatus.Draft);
        await SeedAsync(byInvoice, byNarration, other);

        var invoice = await _sut.Handle(new SearchPurchaseOrdersQuery(Search: "inv-2026"), CancellationToken.None);
        var narration = await _sut.Handle(new SearchPurchaseOrdersQuery(Search: "DASHAIN"), CancellationToken.None);
        var id = await _sut.Handle(new SearchPurchaseOrdersQuery(Search: other.Id.ToString().ToUpperInvariant()), CancellationToken.None);

        invoice.Items.ShouldHaveSingleItem().Id.ShouldBe(byInvoice.Id);
        narration.Items.ShouldHaveSingleItem().Id.ShouldBe(byNarration.Id);
        id.Items.ShouldHaveSingleItem().Id.ShouldBe(other.Id);
    }

    [Fact]
    public async Task Handle_Should_Combine_Search_And_Status()
    {
        await SeedAsync(Order(Nepal, PurchaseOrderStatus.Draft), Order(Nepal, PurchaseOrderStatus.Received));

        var result = await _sut.Handle(new SearchPurchaseOrdersQuery(Status: "Received", Search: "nepal"), CancellationToken.None);

        result.Items.ShouldHaveSingleItem().Status.ShouldBe("Received");
    }

    [Fact]
    public async Task StatusCounts_Should_Count_Every_Status()
    {
        await SeedAsync(
            Order(Himal, PurchaseOrderStatus.Draft),
            Order(Himal, PurchaseOrderStatus.Draft),
            Order(Himal, PurchaseOrderStatus.Approved),
            Order(Nepal, PurchaseOrderStatus.Received),
            Order(Nepal, PurchaseOrderStatus.Cancelled));

        var counts = await new GetPurchaseOrderStatusCountsQueryHandler(_db, AllBranches())
            .Handle(new GetPurchaseOrderStatusCountsQuery(), CancellationToken.None);

        counts.Total.ShouldBe(5);
        counts.Draft.ShouldBe(2);
        counts.Approved.ShouldBe(1);
        counts.Received.ShouldBe(1);
        counts.Cancelled.ShouldBe(1);
    }

    [Theory]
    [InlineData(null, true)]
    [InlineData("Draft", true)]
    [InlineData("draft, approved", true)]
    [InlineData("Draft,Received,Cancelled", true)]
    [InlineData("pending", false)]
    [InlineData("PartiallyReceived", false)]
    [InlineData("7", false)]
    public void Validator_Should_Accept_Only_Known_Statuses(string? status, bool valid)
    {
        var validator = new SearchPurchaseOrdersQueryValidator();

        validator.Validate(new SearchPurchaseOrdersQuery(Status: status)).IsValid.ShouldBe(valid);
    }

    [Fact]
    public void Validator_Should_Reject_PageSize_Above_200()
    {
        // The Purchases page asked for 1000 orders to compute its summary cards, which this rejected.
        new SearchPurchaseOrdersQueryValidator().Validate(new SearchPurchaseOrdersQuery(PageSize: 1000)).IsValid.ShouldBeFalse();
    }

    public void Dispose() => _db.Dispose();
}
