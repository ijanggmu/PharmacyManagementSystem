using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.v1.Reports;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using FSH.Modules.Purchasing.Features.v1.Reports.GetIrdPurchaseRegister;
using FSH.Modules.Purchasing.Features.v1.Reports.GetPurchaseVatSummary;
using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Contracts.v1.Returns;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using Mediator;
using NSubstitute;

namespace Purchasing.Tests.Features.Reports;

/// <summary>The VAT return's purchases section: taxable/exempt split, debit notes and voids, agreement with the register.</summary>
public sealed class GetPurchaseVatSummaryQueryHandlerTests : IDisposable
{
    private readonly PurchasingDbContext _db = PurchasingDbContextFactory.Create();
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();

    public GetPurchaseVatSummaryQueryHandlerTests()
    {
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0));
        _mediator.Send(Arg.Any<GetSupplierDebitNotesQuery>(), Arg.Any<CancellationToken>())
            .Returns(new List<SupplierDebitNoteRegisterDto>
            {
                new(Guid.CreateVersion7(), DateTime.UtcNow, Guid.CreateVersion7(), "DN-1", "BILL-1", 100m, 13m, null, ExemptAmount: 15m),
            });
        _mediator.Send(Arg.Any<GetSupplierByIdQuery>(), Arg.Any<CancellationToken>())
            .Returns<SupplierDto>(_ => throw new NotFoundException("not found"));
    }

    public void Dispose() => _db.Dispose();

    private async Task SeedAsync()
    {
        var order = PurchaseOrder.CreateDraft(Guid.CreateVersion7(), DateTime.UtcNow.AddDays(-3), null, "PO-BILL");
        order.AddLine(Guid.CreateVersion7(), "B1", null, 10m, 50m, 8m, null, 65m); // 500 taxable, 65 VAT
        order.AddLine(Guid.CreateVersion7(), "B2", null, 4m, 25m, 8m, null, 0m);   // 100 exempt
        order.Approve("tester");
        order.Receive("tester", DateTime.UtcNow.AddHours(-2));
        _db.PurchaseOrders.Add(order);

        var receipt = DirectGoodsReceipt.Create(Guid.CreateVersion7(), DateTime.UtcNow.AddHours(-1), "BILL-7", "tester", Guid.CreateVersion7());
        receipt.AddLine(Guid.CreateVersion7(), 10m, 20m, 26m); // 200 taxable, 26 VAT
        _db.DirectGoodsReceipts.Add(receipt);

        var voided = DirectGoodsReceipt.Create(Guid.CreateVersion7(), DateTime.UtcNow.AddDays(-40), "BILL-9", "tester", Guid.CreateVersion7());
        voided.AddLine(Guid.CreateVersion7(), 10m, 10m, 13m); // 100 taxable, 13 VAT, voided today
        voided.Void("tester", "wrong entry");
        _db.DirectGoodsReceipts.Add(voided);
        await _db.SaveChangesAsync(CancellationToken.None);
    }

    [Fact]
    public async Task Handle_Should_Split_Taxable_And_Exempt_And_Subtract_Debit_Notes_And_Voids()
    {
        await SeedAsync();

        var result = await new GetPurchaseVatSummaryQueryHandler(_db, _mediator, _currentBranch).Handle(
            new GetPurchaseVatSummaryQuery(DateTime.UtcNow.AddDays(-1), DateTime.UtcNow.AddDays(1)), CancellationToken.None);

        result.BillCount.ShouldBe(2);
        result.TaxablePurchases.ShouldBe(700m);
        result.ExemptPurchases.ShouldBe(100m);
        result.InputVat.ShouldBe(91m);
        result.ImportPurchases.ShouldBe(0m);
        result.DebitNoteCount.ShouldBe(2);
        result.DebitNotesTaxable.ShouldBe(200m);
        result.DebitNotesExempt.ShouldBe(15m);
        result.DebitNotesVat.ShouldBe(26m);
    }

    [Fact]
    public async Task Handle_Should_Equal_The_Register_Totals_For_The_Same_Period()
    {
        await SeedAsync();
        var from = DateTime.UtcNow.AddDays(-1);
        var to = DateTime.UtcNow.AddDays(1);

        var register = await new GetIrdPurchaseRegisterQueryHandler(_db, _mediator, _currentBranch)
            .Handle(new GetIrdPurchaseRegisterQuery(from, to), CancellationToken.None);
        var summary = await new GetPurchaseVatSummaryQueryHandler(_db, _mediator, _currentBranch)
            .Handle(new GetPurchaseVatSummaryQuery(from, to), CancellationToken.None);

        (summary.TaxablePurchases - summary.DebitNotesTaxable).ShouldBe(register.Sum(r => r.TaxableAmount));
        (summary.ExemptPurchases - summary.DebitNotesExempt).ShouldBe(register.Sum(r => r.ExemptAmount));
        (summary.InputVat - summary.DebitNotesVat).ShouldBe(register.Sum(r => r.VatAmount));
    }

    [Fact]
    public async Task Handle_Should_Ask_Suppliers_For_Debit_Notes_In_The_Period_And_Resolved_Branch()
    {
        var branchId = Guid.CreateVersion7();
        var from = DateTime.UtcNow.AddDays(-1);
        var to = DateTime.UtcNow;
        using var cts = new CancellationTokenSource();

        await new GetPurchaseVatSummaryQueryHandler(_db, _mediator, _currentBranch)
            .Handle(new GetPurchaseVatSummaryQuery(from, to, branchId), cts.Token);

        await _mediator.Received(1).Send(
            Arg.Is<GetSupplierDebitNotesQuery>(q => q.PeriodStartUtc == from && q.PeriodEndUtc == to && q.BranchId == branchId), cts.Token);
    }
}
