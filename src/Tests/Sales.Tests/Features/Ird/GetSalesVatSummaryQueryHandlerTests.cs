using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.v1.Ird;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Ird.GetIrdSalesRegister;
using FSH.Modules.Sales.Features.v1.Ird.GetSalesVatSummary;
using Mediator;
using NSubstitute;

namespace Sales.Tests.Features.Ird;

/// <summary>The VAT return's sales section: taxable/exempt split, credit notes, and agreement with the register.</summary>
public sealed class GetSalesVatSummaryQueryHandlerTests : IDisposable
{
    private readonly SalesDbContext _db = SalesDbContextFactory.Create();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();

    public GetSalesVatSummaryQueryHandlerTests()
    {
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0));
    }

    public void Dispose() => _db.Dispose();

    private static Sale MixedSale(string invoice)
    {
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), null, null, null);
        sale.AddItem(Guid.CreateVersion7(), 2m, 113m, 0m, 0m, 50m, isTaxable: true);
        sale.AddItem(Guid.CreateVersion7(), 1m, 40m, 0m, 0m, 20m, isTaxable: false);
        sale.ApplyVat(13m);
        sale.Finalize("Cash", sale.TotalAmount);
        sale.AssignInvoiceNumberIfMissing(invoice);
        return sale;
    }

    [Fact]
    public async Task Handle_Should_Split_Taxable_And_Exempt_And_Subtract_Credit_Notes()
    {
        var sale = MixedSale("INV-1");
        _db.Sales.Add(sale);
        var cancelled = MixedSale("INV-2");
        cancelled.Cancel("void");
        _db.Sales.Add(cancelled);

        var saleReturn = SaleReturn.Create(sale.BranchId, sale.Id, null, DateTime.UtcNow, ReturnStatus.Completed, "damaged", null, "cash");
        saleReturn.AddItem(sale.Items[0].Id, sale.Items[0].MedicineId, 1m, 113m, 50m, "damaged", PackagingCondition.Sealed, 113m);
        saleReturn.ApplyVatBreakdown(VatBreakdown.Compute(13m, [(113m, true)]));
        saleReturn.AssignCreditNote("CN-1", 2083);
        saleReturn.MarkStockRestoredIfNeeded();
        _db.SaleReturns.Add(saleReturn);
        await _db.SaveChangesAsync(CancellationToken.None);

        var result = await new GetSalesVatSummaryQueryHandler(_db, _currentBranch).Handle(
            new GetSalesVatSummaryQuery(DateTime.UtcNow.AddDays(-1), DateTime.UtcNow.AddDays(1)), CancellationToken.None);

        // Two invoices of 200 taxable + 26 VAT + 40 exempt; one cancelled and one 100 + 13 return.
        result.InvoiceCount.ShouldBe(2);
        result.TaxableSales.ShouldBe(400m);
        result.ExemptSales.ShouldBe(80m);
        result.OutputVat.ShouldBe(52m);
        result.ExportSales.ShouldBe(0m);
        result.CreditNoteCount.ShouldBe(2);
        result.ReturnsTaxable.ShouldBe(300m);
        result.ReturnsExempt.ShouldBe(40m);
        result.ReturnsVat.ShouldBe(39m);
        result.UnclassifiedSales.ShouldBe(0m);
    }

    [Fact]
    public async Task Handle_Should_Equal_The_Register_Totals_For_The_Same_Period()
    {
        var sale = MixedSale("INV-1");
        var cancelled = MixedSale("INV-2");
        cancelled.Cancel("void");
        var legacy = Sale.StartBuilding(Guid.CreateVersion7(), null, null, null);
        legacy.AddItem(Guid.CreateVersion7(), 1m, 75m, 0m, 0m, 20m);
        legacy.Finalize("Cash", legacy.TotalAmount);
        _db.Sales.AddRange(sale, cancelled, legacy);
        await _db.SaveChangesAsync(CancellationToken.None);
        var from = DateTime.UtcNow.AddDays(-1);
        var to = DateTime.UtcNow.AddDays(1);

        var mediator = Substitute.For<IMediator>();
        mediator.Send(Arg.Any<LookupCustomersQuery>(), Arg.Any<CancellationToken>()).Returns(new List<CustomerLookupDto>());
        var register = await new GetIrdSalesRegisterQueryHandler(_db, mediator, _currentBranch)
            .Handle(new GetIrdSalesRegisterQuery(from, to), CancellationToken.None);
        var summary = await new GetSalesVatSummaryQueryHandler(_db, _currentBranch)
            .Handle(new GetSalesVatSummaryQuery(from, to), CancellationToken.None);

        (summary.TaxableSales - summary.ReturnsTaxable).ShouldBe(register.Sum(r => r.TaxableAmount ?? 0m));
        (summary.ExemptSales - summary.ReturnsExempt).ShouldBe(register.Sum(r => r.ExemptAmount ?? 0m));
        (summary.OutputVat - summary.ReturnsVat).ShouldBe(register.Sum(r => r.TaxAmount ?? 0m));
        summary.UnclassifiedSales.ShouldBe(75m);
    }

    [Fact]
    public async Task Handle_Should_Pass_The_Requested_Branch_To_The_Branch_Rule()
    {
        var branchId = Guid.CreateVersion7();
        using var cts = new CancellationTokenSource();

        await new GetSalesVatSummaryQueryHandler(_db, _currentBranch)
            .Handle(new GetSalesVatSummaryQuery(DateTime.UtcNow.AddDays(-1), DateTime.UtcNow, branchId), cts.Token);

        await _currentBranch.Received(1).ResolveListBranchFilterAsync(branchId, cts.Token);
    }
}
