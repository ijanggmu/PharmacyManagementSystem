using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Identity.Contracts.DTOs;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.Ird;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Ird.GetIrdBillRegister;
using Mediator;
using NSubstitute;

namespace Sales.Tests.Features.Ird;

public sealed class GetIrdBillRegisterQueryHandlerTests : IDisposable
{
    private readonly SalesDbContext _db = SalesDbContextFactory.Create();
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly IUserService _users = Substitute.For<IUserService>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly Guid _cashierId = Guid.CreateVersion7();
    private readonly Guid _printerId = Guid.CreateVersion7();
    private readonly GetIrdBillRegisterQueryHandler _sut;

    public GetIrdBillRegisterQueryHandlerTests()
    {
        _currentBranch.GetListFilterBranchIdAsync(Arg.Any<CancellationToken>()).Returns((Guid?)null);
        _users.GetListAsync(Arg.Any<CancellationToken>()).Returns(
        [
            new UserDto { Id = _cashierId.ToString(), FirstName = "Gita", LastName = "Cashier" },
            new UserDto { Id = _printerId.ToString(), UserName = "printer1" },
        ]);
        _sut = new GetIrdBillRegisterQueryHandler(_db, _mediator, _users, _currentBranch);
    }

    private Sale NewSale(Guid? customerId, string invoice, string? buyerName = null, string? buyerPan = null, decimal price = 113m)
    {
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), customerId, null, null, _cashierId);
        sale.SetBuyer(buyerName, buyerPan);
        sale.AddItem(Guid.CreateVersion7(), 1m, price, 13m, 0m, 50m);
        sale.Finalize("fonepay", sale.TotalAmount);
        sale.ApplyVat(13m);
        sale.AssignInvoice(invoice, 2083);
        _db.Sales.Add(sale);
        return sale;
    }

    [Fact]
    public async Task Handle_Should_Return_Every_Ird_Materialized_View_Column()
    {
        var customerId = Guid.CreateVersion7();
        var printed = NewSale(customerId, "INV-MAIN-2083/84-00001", buyerPan: "987654321");
        var cancelled = NewSale(null, "INV-MAIN-2083/84-00002", price: 50_000m);
        cancelled.Cancel("Duplicate");
        await _db.SaveChangesAsync(CancellationToken.None);

        _db.SalePrints.Add(SalePrint.Record(printed.Id, printed.BranchId, 1, "thermal-80", _printerId));
        _db.SalePrints.Add(SalePrint.Record(printed.Id, printed.BranchId, 2, "thermal-80", _printerId));
        var bill = IrdInvoiceQueueEntry.Enqueue(printed.Id, "{\"invoice_number\":\"x\"}", printed.InvoiceNumber, DateTime.UtcNow);
        bill.BeginAttempt();
        bill.MarkSent("200", isRealtime: true);
        _db.IrdInvoiceQueues.Add(bill);
        printed.MarkIrdSynced(null);
        await _db.SaveChangesAsync(CancellationToken.None);

        _mediator.Send(Arg.Any<LookupCustomersQuery>(), Arg.Any<CancellationToken>())
            .Returns(new List<CustomerLookupDto> { new(customerId, "Jane Doe", null) });

        var rows = await _sut.Handle(
            new GetIrdBillRegisterQuery(DateTime.UtcNow.AddDays(-1), DateTime.UtcNow.AddDays(1)), CancellationToken.None);

        rows.Count.ShouldBe(2);
        var first = rows.Single(r => r.SaleId == printed.Id);
        first.FiscalYear.ShouldBe("2083/84");
        first.BillNo.ShouldBe("INV-MAIN-2083/84-00001");
        first.CustomerName.ShouldBe("Jane Doe");
        first.CustomerPan.ShouldBe("987654321");
        first.BillDate.ShouldMatch(@"^\d{4}\.\d{2}\.\d{2}$");
        first.Amount.ShouldBe(113m);
        first.Discount.ShouldBe(13m);
        first.TotalAmount.ShouldBe(100m);
        (first.TaxableAmount + first.TaxAmount + first.ExemptAmount).ShouldBe(100m);
        first.SyncWithIrd.ShouldBeTrue();
        first.IsBillPrinted.ShouldBeTrue();
        first.PrintCount.ShouldBe(2);
        first.PrintedTimeUtc.ShouldNotBeNull();
        first.PrintedBy.ShouldBe("printer1");
        first.EnteredBy.ShouldBe("Gita Cashier");
        first.IsBillActive.ShouldBeTrue();
        first.IsRealtime.ShouldBe(true);
        first.PaymentMethod.ShouldBe("fonepay");
        first.VatRefundAmount.ShouldBe(0m);
        first.InvoiceType.ShouldBe(IrdInvoiceTypes.TaxInvoice);

        var second = rows.Single(r => r.SaleId == cancelled.Id);
        second.IsBillActive.ShouldBeFalse();
        second.IsBillPrinted.ShouldBeFalse();
        second.SyncWithIrd.ShouldBeFalse();
        second.IsRealtime.ShouldBeNull();
        second.CustomerName.ShouldBe(string.Empty);
        second.VatRefundAmount.ShouldBe(second.TaxAmount);
        second.InvoiceType.ShouldBe(IrdInvoiceTypes.TaxInvoice); // above the abbreviated threshold
    }

    [Fact]
    public void ResolvePeriod_Should_Narrow_To_The_Fiscal_Year_In_Nepal_Time()
    {
        var (from, to) = GetIrdBillRegisterQueryHandler.ResolvePeriod(new GetIrdBillRegisterQuery(null, null, 2083));

        from.ShouldBe(new DateTime(2026, 7, 16, 18, 15, 0, DateTimeKind.Utc));      // 1 Shrawan 2083 00:00 NPT
        to.ShouldBe(new DateTime(2027, 7, 16, 18, 15, 0, DateTimeKind.Utc).AddTicks(-1));
    }

    [Fact]
    public void Validator_Should_Require_A_Period()
    {
        var validator = new GetIrdBillRegisterQueryValidator();
        validator.Validate(new GetIrdBillRegisterQuery(null, null)).IsValid.ShouldBeFalse();
        validator.Validate(new GetIrdBillRegisterQuery(null, null, 2083)).IsValid.ShouldBeTrue();
        validator.Validate(new GetIrdBillRegisterQuery(DateTime.UtcNow, DateTime.UtcNow.AddDays(-1))).IsValid.ShouldBeFalse();
    }

    public void Dispose() => _db.Dispose();
}
