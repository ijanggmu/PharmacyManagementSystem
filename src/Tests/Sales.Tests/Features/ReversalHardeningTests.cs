using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Reference.Contracts.Dtos;
using FSH.Modules.Reference.Contracts.v1.Settings;
using FSH.Modules.Sales.Contracts.Events;
using FSH.Modules.Sales.Contracts.v1.CashShifts;
using FSH.Modules.Sales.Contracts.v1.Refunds;
using FSH.Modules.Sales.Contracts.v1.Returns;
using FSH.Modules.Sales.Contracts.v1.Sales;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.CashShifts.GetCashShiftSummary;
using FSH.Modules.Sales.Features.v1.Refunds.CreateRefund;
using FSH.Modules.Sales.Features.v1.Refunds.DeleteRefund;
using FSH.Modules.Sales.Features.v1.Refunds.UpdateRefundStatus;
using FSH.Modules.Sales.Features.v1.Returns.CreateReturn;
using FSH.Modules.Sales.Features.v1.Returns.DeleteReturn;
using FSH.Modules.Sales.Features.v1.Sales.CancelSale;
using FSH.Modules.Sales.Features.v1.Sales.GetReversalPreview;
using FSH.Modules.Sales.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using NSubstitute.ExceptionExtensions;

namespace Sales.Tests.Features;

/// <summary>
/// Credit-note numbering of returns/refunds, the still-open on-account cap, the legacy VAT fallback, the
/// cross-branch refusal, the IRD cancel guard, delete under the sale lock, the settlement preview and the
/// cash-drawer effect of cancelling an earlier sale.
/// </summary>
public sealed class ReversalHardeningTests : IDisposable
{
    private readonly SalesDbContext _db = SalesDbContextFactory.Create();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly IInvoiceNumberService _invoiceNumbers = Substitute.For<IInvoiceNumberService>();
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly Guid _branchId = Guid.CreateVersion7();

    public ReversalHardeningTests()
    {
        _currentUser.GetTenant().Returns("test-tenant");
        _currentUser.GetUserId().Returns(Guid.CreateVersion7());
        _currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
        _invoiceNumbers.ResolveContextAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>())
            .Returns(new InvoiceNumberContext("INV", "MAIN"));
        _invoiceNumbers.ReserveNextCreditNoteAsync(Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns(1, 2, 3, 4, 5);
        _mediator.Send(Arg.Any<GetPharmacySettingsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new PharmacySettingsDto(Guid.CreateVersion7(), "Test Pharmacy", null, null, null, "NPR", 13m, "INV", 1, null));
    }

    private CreateReturnCommandHandler Returns() => new(_db, _outbox, _currentUser, _currentBranch, _mediator, _invoiceNumbers);

    private CreateRefundCommandHandler Refunds() => new(_db, _outbox, _currentUser, _currentBranch, _invoiceNumbers, _mediator, Substitute.For<ISaleControls>());

    private UpdateRefundStatusCommandHandler UpdateRefund() => new(_db, _outbox, _currentUser, _currentBranch, _mediator, _invoiceNumbers);

    private CancelSaleCommandHandler Cancel() => new(_db, _outbox, _currentUser, _currentBranch, Substitute.For<ISaleControls>());

    private async Task<Sale> SeedSaleAsync(Guid? customerId = null, decimal? vatRate = 13m, params SaleTender[] tenders)
    {
        var sale = Sale.StartBuilding(_branchId, customerId, null, null);
        sale.AddItem(Guid.CreateVersion7(), 2m, 100m, 20m, 0m, 60m);
        sale.Finalize(tenders.Length == 0 ? [new SaleTender("cash", 180m, null)] : tenders, shortfallIsOnAccount: false);
        if (vatRate is { } rate)
        {
            sale.ApplyVat(rate);
        }

        _db.Sales.Add(sale);
        await _db.SaveChangesAsync(CancellationToken.None);
        return sale;
    }

    private static CreateReturnCommand ReturnOf(Sale sale, decimal quantity, string status = "pending", string? method = null) =>
        new(sale.Id, null, DateTime.UtcNow, [new ReturnItemInput(sale.Items[0].Id, quantity, "damaged", "sealed")],
            Status: status, RefundMethod: method);

    private static CreateRefundCommand RefundOf(Sale sale, decimal quantity, string status = "pending", string method = "cash") =>
        new(sale.Id, null, DateTime.UtcNow, "defective", [new RefundItemInput(sale.Items[0].Id, quantity)],
            Status: status, RefundMethod: method);

    [Fact]
    public async Task Completed_Return_Should_Get_A_Sequential_Credit_Note_Number()
    {
        var sale = await SeedSaleAsync();

        var pendingId = await Returns().Handle(ReturnOf(sale, 1m), CancellationToken.None);
        var completedId = await Returns().Handle(ReturnOf(sale, 1m, status: "completed"), CancellationToken.None);

        (await _db.SaleReturns.FirstAsync(r => r.Id == pendingId)).CreditNoteNumber.ShouldBeNull();
        var completed = await _db.SaleReturns.FirstAsync(r => r.Id == completedId);
        completed.CreditNoteNumber.ShouldNotBeNull();
        completed.CreditNoteNumber.ShouldEndWith("-00001");
        completed.FiscalYear.ShouldNotBeNull();
        await _outbox.Received(1).AddAsync(
            Arg.Is<ReturnCompletedIntegrationEvent>(e => e.CreditNoteNumber == completed.CreditNoteNumber),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Refund_Should_Get_Its_Credit_Note_Number_Only_When_Completed()
    {
        var sale = await SeedSaleAsync();

        var rejectedId = await Refunds().Handle(RefundOf(sale, 1m, status: "rejected"), CancellationToken.None);
        var refundId = await Refunds().Handle(RefundOf(sale, 1m), CancellationToken.None);
        (await _db.SaleRefunds.FirstAsync(r => r.Id == rejectedId)).CreditNoteNumber.ShouldBeNull();
        (await _db.SaleRefunds.FirstAsync(r => r.Id == refundId)).CreditNoteNumber.ShouldBeNull();

        await UpdateRefund().Handle(new UpdateRefundStatusCommand(refundId, "completed"), CancellationToken.None);

        // The rejected refund burnt no number: the completed one takes the first.
        (await _db.SaleRefunds.FirstAsync(r => r.Id == refundId)).CreditNoteNumber.ShouldNotBeNull().ShouldEndWith("-00001");
    }

    [Fact]
    public async Task Return_Of_A_Credit_Sale_Already_Paid_Should_Follow_The_Refund_Method()
    {
        // 180 total, 100 on account — but the customer has since paid their account off.
        var customerId = Guid.CreateVersion7();
        var sale = await SeedSaleAsync(customerId, 13m, new SaleTender("cash", 80m, null), new SaleTender("credit", 100m, null));
        _mediator.Send(Arg.Is<GetCustomerByIdQuery>(q => q.CustomerId == customerId), Arg.Any<CancellationToken>())
            .Returns(new CustomerDto(customerId, "Ram", null, null, null, 0m, true, DateTime.UtcNow, null));

        await Returns().Handle(ReturnOf(sale, 1m, status: "completed", method: "cash"), CancellationToken.None);

        await _outbox.Received(1).AddAsync(
            Arg.Is<ReturnCompletedIntegrationEvent>(e => e.OnAccountAmount == 0m && e.CashAmount == 90m),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Return_Of_A_Credit_Sale_Should_Cap_On_Account_At_What_The_Customer_Still_Owes()
    {
        var customerId = Guid.CreateVersion7();
        var sale = await SeedSaleAsync(customerId, 13m, new SaleTender("cash", 80m, null), new SaleTender("credit", 100m, null));
        _mediator.Send(Arg.Is<GetCustomerByIdQuery>(q => q.CustomerId == customerId), Arg.Any<CancellationToken>())
            .Returns(new CustomerDto(customerId, "Ram", null, null, null, 30m, true, DateTime.UtcNow, null));

        await Returns().Handle(ReturnOf(sale, 1m, status: "completed", method: "cash"), CancellationToken.None);

        await _outbox.Received(1).AddAsync(
            Arg.Is<ReturnCompletedIntegrationEvent>(e => e.OnAccountAmount == 30m && e.CashAmount == 60m),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Return_Of_A_Legacy_Sale_Without_Vat_Breakdown_Should_Reverse_Vat_At_The_Tenant_Rate()
    {
        var sale = await SeedSaleAsync(vatRate: null);

        var returnId = await Returns().Handle(ReturnOf(sale, 1m, status: "completed"), CancellationToken.None);

        var saleReturn = await _db.SaleReturns.FirstAsync(r => r.Id == returnId);
        saleReturn.VatAmount.ShouldBe(10.35m); // 90 x 13 / 113
        saleReturn.VatRatePercent.ShouldBe(13m);
    }

    [Fact]
    public async Task Return_And_Refund_At_Another_Branch_Should_Be_Refused()
    {
        var sale = await SeedSaleAsync();
        // A user who can see every branch (otherwise the sale is simply not visible: 404), working at another one.
        _currentBranch.CanViewAllBranchesAsync(Arg.Any<CancellationToken>()).Returns(true);
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(Guid.CreateVersion7());

        var returnEx = await Should.ThrowAsync<CustomException>(() => Returns().Handle(ReturnOf(sale, 1m), CancellationToken.None).AsTask());
        var refundEx = await Should.ThrowAsync<CustomException>(() => Refunds().Handle(RefundOf(sale, 1m), CancellationToken.None).AsTask());

        returnEx.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
        returnEx.Message.ShouldContain("Switch to that branch");
        refundEx.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
        (await _db.SaleReturns.CountAsync()).ShouldBe(0);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Cancel_Should_Be_Refused_Once_The_Invoice_Is_Being_Or_Has_Been_Sent_To_Ird(bool sent)
    {
        var sale = await SeedSaleAsync();
        var item = IrdInvoiceQueueEntry.Enqueue(sale.Id, "{}");
        item.BeginAttempt();
        if (sent)
        {
            item.MarkSent();
        }

        _db.IrdInvoiceQueues.Add(item);
        await _db.SaveChangesAsync(CancellationToken.None);

        var ex = await Should.ThrowAsync<CustomException>(() =>
            Cancel().Handle(new CancelSaleCommand(sale.Id, "void"), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
        ex.Message.ShouldContain("credit note");
        (await _db.Sales.FirstAsync(s => s.Id == sale.Id)).Status.ShouldBe(SaleStatus.Completed);
    }

    [Fact]
    public async Task Cancel_Should_Still_Be_Allowed_While_The_Ird_Item_Is_Only_Pending()
    {
        var sale = await SeedSaleAsync();
        _db.IrdInvoiceQueues.Add(IrdInvoiceQueueEntry.Enqueue(sale.Id, "{}"));
        await _db.SaveChangesAsync(CancellationToken.None);

        await Cancel().Handle(new CancelSaleCommand(sale.Id, "void"), CancellationToken.None);

        (await _db.Sales.FirstAsync(s => s.Id == sale.Id)).Status.ShouldBe(SaleStatus.Cancelled);
    }

    [Fact]
    public async Task Delete_Should_Remove_A_Pending_Return_And_Refuse_A_Completed_One()
    {
        var sale = await SeedSaleAsync();
        var pendingId = await Returns().Handle(ReturnOf(sale, 1m), CancellationToken.None);
        var completedId = await Returns().Handle(ReturnOf(sale, 1m, status: "completed"), CancellationToken.None);
        var sut = new DeleteReturnCommandHandler(_db, _currentUser, _currentBranch);

        await sut.Handle(new DeleteReturnCommand(pendingId), CancellationToken.None);
        var ex = await Should.ThrowAsync<CustomException>(() => sut.Handle(new DeleteReturnCommand(completedId), CancellationToken.None).AsTask());

        (await _db.SaleReturns.AnyAsync(r => r.Id == pendingId)).ShouldBeFalse();
        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Delete_Should_Remove_A_Pending_Refund()
    {
        var sale = await SeedSaleAsync();
        var refundId = await Refunds().Handle(RefundOf(sale, 1m), CancellationToken.None);

        await new DeleteRefundCommandHandler(_db, _currentUser, _currentBranch).Handle(new DeleteRefundCommand(refundId), CancellationToken.None);

        (await _db.SaleRefunds.AnyAsync(r => r.Id == refundId)).ShouldBeFalse();
    }

    [Fact]
    public async Task Preview_Should_Show_The_Split_Completion_Would_Apply()
    {
        var customerId = Guid.CreateVersion7();
        var sale = await SeedSaleAsync(customerId, 13m, new SaleTender("cash", 80m, null), new SaleTender("credit", 100m, null));
        _mediator.Send(Arg.Is<GetCustomerByIdQuery>(q => q.CustomerId == customerId), Arg.Any<CancellationToken>())
            .Returns(new CustomerDto(customerId, "Ram", null, null, null, 100m, true, DateTime.UtcNow, null));
        var sut = new GetReversalSettlementPreviewQueryHandler(_db, _mediator, _currentBranch);

        var preview = await sut.Handle(new GetReversalSettlementPreviewQuery(sale.Id, 180m, "cash"), CancellationToken.None);

        preview.OnAccount.ShouldBe(100m);
        preview.Cash.ShouldBe(80m);
        preview.Bank.ShouldBe(0m);
        preview.Total.ShouldBe(180m);
        preview.OnAccountCap.ShouldBe(100m);
    }

    [Fact]
    public async Task Preview_Should_Refuse_Store_Credit_On_A_Walk_In_Sale()
    {
        var sale = await SeedSaleAsync();
        var sut = new GetReversalSettlementPreviewQueryHandler(_db, _mediator, _currentBranch);

        var ex = await Should.ThrowAsync<CustomException>(() =>
            sut.Handle(new GetReversalSettlementPreviewQuery(sale.Id, 90m, "store_credit"), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Cash_Drawer_Should_Pay_Out_The_Cash_Of_An_Earlier_Sale_Cancelled_During_The_Shift()
    {
        var sale = await SeedSaleAsync();
        await Task.Delay(20);
        var shift = CashShift.Open(_branchId, "cashier", 500m, null);
        _db.CashShifts.Add(shift);
        await _db.SaveChangesAsync(CancellationToken.None);

        await Cancel().Handle(new CancelSaleCommand(sale.Id, "wrong customer"), CancellationToken.None);

        var summary = await new GetCashShiftSummaryQueryHandler(_db, _currentBranch, Substitute.For<Mediator.IMediator>())
            .Handle(new GetCashShiftSummaryQuery(shift.Id), CancellationToken.None);
        summary.CashSalesTotal.ShouldBe(0m);
        summary.CashRefundsTotal.ShouldBe(180m);
        summary.ExpectedCash.ShouldBe(320m);
    }

    [Fact]
    public async Task Cash_Drawer_Should_Net_A_Sale_Rung_Up_And_Cancelled_In_The_Same_Shift_To_Zero()
    {
        var shift = CashShift.Open(_branchId, "cashier", 500m, null);
        _db.CashShifts.Add(shift);
        await _db.SaveChangesAsync(CancellationToken.None);
        var sale = await SeedSaleAsync();

        await Cancel().Handle(new CancelSaleCommand(sale.Id, "void"), CancellationToken.None);

        var summary = await new GetCashShiftSummaryQueryHandler(_db, _currentBranch, Substitute.For<Mediator.IMediator>())
            .Handle(new GetCashShiftSummaryQuery(shift.Id), CancellationToken.None);
        summary.ExpectedCash.ShouldBe(500m);
    }

    public void Dispose() => _db.Dispose();
}
