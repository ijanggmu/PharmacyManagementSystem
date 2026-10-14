using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Events;
using FSH.Modules.Sales.Contracts.v1.CashShifts;
using FSH.Modules.Sales.Contracts.v1.Refunds;
using FSH.Modules.Sales.Contracts.v1.Returns;
using FSH.Modules.Sales.Contracts.v1.Sales;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.CashShifts.CloseCashShift;
using FSH.Modules.Sales.Features.v1.CashShifts.GetCashShiftSummary;
using FSH.Modules.Sales.Features.v1.Refunds.CreateRefund;
using FSH.Modules.Sales.Features.v1.Refunds.UpdateRefundStatus;
using FSH.Modules.Sales.Features.v1.Returns.CreateReturn;
using FSH.Modules.Sales.Features.v1.Returns.UpdateReturnStatus;
using FSH.Modules.Sales.Features.v1.Sales.CancelSale;
using FSH.Modules.Sales.Services;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Sales.Tests.Features;

/// <summary>
/// Cancel / return / refund of the same sale, checked together: valuation at the after-discount price,
/// one combined per-line cap, no reversal of a cancelled sale, no cancel over open returns/refunds,
/// terminal rejected status, single completion, settlement split and the cash-drawer effect.
/// </summary>
public sealed class SaleLifecycleTests : IDisposable
{
    private readonly SalesDbContext _db = SalesDbContextFactory.Create();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly IInvoiceNumberService _invoiceNumbers = Substitute.For<IInvoiceNumberService>();
    private readonly Mediator.IMediator _mediator = Substitute.For<Mediator.IMediator>();
    private readonly Guid _branchId = Guid.CreateVersion7();

    public SaleLifecycleTests()
    {
        _currentUser.GetTenant().Returns("test-tenant");
        _currentUser.Name.Returns("cashier");
        _currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
        _invoiceNumbers.ResolveContextAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>())
            .Returns(new InvoiceNumberContext("INV", "MAIN"));
        _invoiceNumbers.ReserveNextCreditNoteAsync(Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns(1, 2, 3, 4, 5);
        _mediator.Send(Arg.Any<FSH.Modules.Reference.Contracts.v1.Settings.GetPharmacySettingsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new FSH.Modules.Reference.Contracts.Dtos.PharmacySettingsDto(Guid.CreateVersion7(), "Test Pharmacy", null, null, null, "NPR", 13m, "INV", 1, null));
    }

    private CreateReturnCommandHandler Returns() => new(_db, _outbox, _currentUser, _currentBranch, _mediator, _invoiceNumbers, Substitute.For<ISaleControls>());

    private CreateRefundCommandHandler Refunds() => new(_db, _outbox, _currentUser, _currentBranch, _invoiceNumbers, _mediator, Substitute.For<ISaleControls>());

    private UpdateReturnStatusCommandHandler UpdateReturn() => new(_db, _outbox, _currentUser, _currentBranch, _mediator, _invoiceNumbers, Substitute.For<ISaleControls>());

    private UpdateRefundStatusCommandHandler UpdateRefund() => new(_db, _outbox, _currentUser, _currentBranch, _mediator, _invoiceNumbers, Substitute.For<ISaleControls>());

    private CancelSaleCommandHandler Cancel() => new(_db, _outbox, _currentUser, _currentBranch, Substitute.For<ISaleControls>());

    /// <summary>2 units at 100 with 20 off the line (net 180), 13% VAT, paid as given.</summary>
    private async Task<Sale> SeedSaleAsync(Guid? customerId = null, params SaleTender[] tenders)
    {
        var sale = Sale.StartBuilding(_branchId, customerId, null, null);
        sale.AddItem(Guid.CreateVersion7(), 2m, 100m, 20m, 0m, 60m);
        sale.Finalize(tenders.Length == 0 ? [new SaleTender("cash", 180m, null)] : tenders, shortfallIsOnAccount: false);
        sale.ApplyVat(13m);
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

    // ---- valuation -------------------------------------------------------------------------------

    [Fact]
    public async Task Return_Should_Be_Valued_At_The_After_Discount_Price()
    {
        var sale = await SeedSaleAsync();

        var first = await Returns().Handle(ReturnOf(sale, 1m), CancellationToken.None);
        var second = await Returns().Handle(ReturnOf(sale, 1m), CancellationToken.None);

        var returns = await _db.SaleReturns.Include(r => r.Items).ToListAsync();
        returns.Single(r => r.Id == first).TotalReturnAmount.ShouldBe(90m);
        returns.Single(r => r.Id == second).TotalReturnAmount.ShouldBe(90m);
        returns.Sum(r => r.TotalReturnAmount).ShouldBe(180m); // never more than was paid
        returns[0].Items[0].UnitPrice.ShouldBe(90m);
        returns[0].BranchId.ShouldBe(sale.BranchId);
    }

    [Fact]
    public async Task Refund_Vat_Should_Be_Carved_Out_Of_The_Discounted_Amount()
    {
        var sale = await SeedSaleAsync();

        var refundId = await Refunds().Handle(RefundOf(sale, 2m), CancellationToken.None);

        var refund = await _db.SaleRefunds.Include(r => r.Items).FirstAsync(r => r.Id == refundId);
        refund.RefundAmount.ShouldBe(180m);
        refund.NetRefundAmount.ShouldBe(180m);
        refund.VatAmount.ShouldBe(20.71m); // 180 x 13 / 113
    }

    // ---- combined cap / cancelled sale / cancel guard -------------------------------------------

    [Fact]
    public async Task Return_And_Refund_Should_Share_One_Cap_Per_Line()
    {
        var sale = await SeedSaleAsync();
        await Refunds().Handle(RefundOf(sale, 1m), CancellationToken.None);
        await Returns().Handle(ReturnOf(sale, 1m), CancellationToken.None);

        var ex = await Should.ThrowAsync<CustomException>(() => Returns().Handle(ReturnOf(sale, 1m), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
        ex.Message.ShouldContain("Only 0 more");
    }

    [Fact]
    public async Task Cancelled_Sale_Should_Refuse_Returns_And_Refunds()
    {
        var sale = await SeedSaleAsync();
        await Cancel().Handle(new CancelSaleCommand(sale.Id, "wrong customer"), CancellationToken.None);

        var returnEx = await Should.ThrowAsync<CustomException>(() => Returns().Handle(ReturnOf(sale, 1m), CancellationToken.None).AsTask());
        var refundEx = await Should.ThrowAsync<CustomException>(() => Refunds().Handle(RefundOf(sale, 1m), CancellationToken.None).AsTask());

        returnEx.Message.ShouldContain("cancelled");
        refundEx.Message.ShouldContain("cancelled");
    }

    [Fact]
    public async Task Cancel_Should_Be_Refused_While_A_Return_Is_Open()
    {
        var sale = await SeedSaleAsync();
        await Returns().Handle(ReturnOf(sale, 1m), CancellationToken.None);

        var ex = await Should.ThrowAsync<CustomException>(() =>
            Cancel().Handle(new CancelSaleCommand(sale.Id, "x"), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
        (await _db.Sales.FirstAsync(s => s.Id == sale.Id)).Status.ShouldBe(SaleStatus.Completed);
    }

    [Fact]
    public async Task Cancel_Should_Be_Allowed_When_Only_Rejected_Reversals_Exist_And_Carry_The_Account_Effect()
    {
        var customerId = Guid.CreateVersion7();
        var sale = await SeedSaleAsync(customerId, new SaleTender("cash", 80m, null), new SaleTender("credit", 100m, null));
        await Returns().Handle(ReturnOf(sale, 1m, status: "rejected"), CancellationToken.None);

        await Cancel().Handle(new CancelSaleCommand(sale.Id, "x"), CancellationToken.None);

        await _outbox.Received(1).AddAsync(
            Arg.Is<SaleCancelledIntegrationEvent>(e =>
                e.CustomerId == customerId && e.OnAccountAmount == 100m && e.BranchId == sale.BranchId),
            Arg.Any<CancellationToken>());
    }

    // ---- status transitions -----------------------------------------------------------------------

    [Fact]
    public async Task Rejected_Return_Should_Not_Be_Reopened()
    {
        var sale = await SeedSaleAsync();
        var returnId = await Returns().Handle(ReturnOf(sale, 2m, status: "rejected"), CancellationToken.None);
        // The rejected return released its quantity; a new return takes it.
        await Returns().Handle(ReturnOf(sale, 2m), CancellationToken.None);

        var sut = UpdateReturn();
        Func<Task> complete = async () => await sut.Handle(new UpdateReturnStatusCommand(returnId, "completed"), CancellationToken.None);
        Func<Task> reopen = async () => await sut.Handle(new UpdateReturnStatusCommand(returnId, "pending"), CancellationToken.None);

        await Should.ThrowAsync<CustomException>(complete);
        await Should.ThrowAsync<CustomException>(reopen);
    }

    [Fact]
    public async Task Completing_A_Return_Twice_Should_Publish_Once()
    {
        var sale = await SeedSaleAsync();
        var returnId = await Returns().Handle(ReturnOf(sale, 1m), CancellationToken.None);
        var sut = UpdateReturn();

        await sut.Handle(new UpdateReturnStatusCommand(returnId, "completed"), CancellationToken.None);
        await sut.Handle(new UpdateReturnStatusCommand(returnId, "completed"), CancellationToken.None);

        await _outbox.Received(1).AddAsync(Arg.Any<ReturnCompletedIntegrationEvent>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Completing_A_Refund_Twice_Should_Publish_Once()
    {
        var sale = await SeedSaleAsync();
        var refundId = await Refunds().Handle(RefundOf(sale, 1m), CancellationToken.None);
        var sut = UpdateRefund();

        await sut.Handle(new UpdateRefundStatusCommand(refundId, "completed"), CancellationToken.None);
        await sut.Handle(new UpdateRefundStatusCommand(refundId, "completed"), CancellationToken.None);

        await _outbox.Received(1).AddAsync(Arg.Any<RefundCompletedIntegrationEvent>(), Arg.Any<CancellationToken>());
    }

    // ---- settlement ---------------------------------------------------------------------------------

    [Fact]
    public async Task Return_Of_A_Credit_Sale_Should_First_Cancel_What_Is_Still_Owed()
    {
        // 180 total: 80 paid in cash, 100 on account. Returning one unit (90) cancels 90 of the debt — no cash out.
        var customerId = Guid.CreateVersion7();
        var sale = await SeedSaleAsync(customerId, new SaleTender("cash", 80m, null), new SaleTender("credit", 100m, null));

        await Returns().Handle(ReturnOf(sale, 1m, status: "completed"), CancellationToken.None);
        // The second unit: only 10 of the debt is left; 80 goes back in cash.
        await Returns().Handle(ReturnOf(sale, 1m, status: "completed"), CancellationToken.None);

        var received = _outbox.ReceivedCalls()
            .Select(c => c.GetArguments()[0])
            .OfType<ReturnCompletedIntegrationEvent>()
            .ToList();
        received.Count.ShouldBe(2);
        received[0].OnAccountAmount.ShouldBe(90m);
        received[0].CashAmount.ShouldBe(0m);
        received[0].VatAmount.ShouldBe(10.35m); // 90 x 13 / 113
        received[0].CustomerId.ShouldBe(customerId);
        received[0].SaleTotalAmount.ShouldBe(180m);
        received[0].ReversedToDateAmount.ShouldBe(90m);
        received[1].OnAccountAmount.ShouldBe(10m);
        received[1].CashAmount.ShouldBe(80m);
        received[1].ReversedToDateAmount.ShouldBe(180m);
    }

    [Fact]
    public async Task Refund_To_Original_Payment_Should_Split_Over_The_Sale_Legs()
    {
        var sale = await SeedSaleAsync(null, new SaleTender("cash", 90m, null), new SaleTender("card", 90m, null));

        await Refunds().Handle(RefundOf(sale, 2m, status: "completed", method: "original_payment"), CancellationToken.None);

        await _outbox.Received(1).AddAsync(
            Arg.Is<RefundCompletedIntegrationEvent>(e =>
                e.CashAmount == 90m && e.BankAmount == 90m && e.OnAccountAmount == 0m
                && e.GrossRefundAmount == 180m && e.VatAmount == 20.71m && e.ProcessingFeeRetained == 0m),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Store_Credit_On_A_Walk_In_Sale_Should_Be_Refused()
    {
        var sale = await SeedSaleAsync();

        var ex = await Should.ThrowAsync<CustomException>(() =>
            Refunds().Handle(RefundOf(sale, 1m, status: "completed", method: "store_credit"), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.BadRequest);
    }

    // ---- cash drawer ----------------------------------------------------------------------------------

    [Fact]
    public async Task Cash_Shift_Should_Subtract_Cash_Paid_Out_And_Freeze_At_Close()
    {
        var shift = CashShift.Open(_branchId, "cashier", 1000m, null);
        _db.CashShifts.Add(shift);
        await _db.SaveChangesAsync(CancellationToken.None);
        var sale = await SeedSaleAsync();
        await Refunds().Handle(RefundOf(sale, 1m, status: "completed"), CancellationToken.None);

        var summaries = new GetCashShiftSummaryQueryHandler(_db, _currentBranch, Substitute.For<Mediator.IMediator>());
        var open = await summaries.Handle(new GetCashShiftSummaryQuery(shift.Id), CancellationToken.None);
        open.CashSalesTotal.ShouldBe(180m);
        open.CashRefundsTotal.ShouldBe(90m);
        open.ExpectedCash.ShouldBe(1090m);

        await new CloseCashShiftCommandHandler(_db, _outbox, _currentUser, _currentBranch, Substitute.For<Mediator.IMediator>())
            .Handle(new CloseCashShiftCommand(shift.Id, 1090m, null), CancellationToken.None);
        // A later return of the same sale belongs to the next shift, not this counted drawer.
        await Returns().Handle(ReturnOf(sale, 1m, status: "completed"), CancellationToken.None);

        var closed = await summaries.Handle(new GetCashShiftSummaryQuery(shift.Id), CancellationToken.None);
        closed.ExpectedCash.ShouldBe(1090m);
        closed.Variance.ShouldBe(0m);
    }

    [Fact]
    public async Task Cash_Shift_Should_Count_Cash_Customers_Paid_On_Account_And_Freeze_It_At_Close()
    {
        var shift = CashShift.Open(_branchId, "cashier", 1000m, null);
        _db.CashShifts.Add(shift);
        await _db.SaveChangesAsync(CancellationToken.None);
        await SeedSaleAsync();

        // Customers reports Rs 400 paid in cash against customer accounts at this branch during the shift.
        var mediator = Substitute.For<Mediator.IMediator>();
        mediator.Send(Arg.Is<FSH.Modules.Customers.Contracts.v1.Ledger.GetCashCustomerReceiptsQuery>(q => q.BranchId == _branchId), Arg.Any<CancellationToken>())
            .Returns(400m);

        var summaries = new GetCashShiftSummaryQueryHandler(_db, _currentBranch, mediator);
        var open = await summaries.Handle(new GetCashShiftSummaryQuery(shift.Id), CancellationToken.None);
        open.CashReceiptsTotal.ShouldBe(400m);
        open.ExpectedCash.ShouldBe(1000m + 180m + 400m);

        await new CloseCashShiftCommandHandler(_db, _outbox, _currentUser, _currentBranch, mediator)
            .Handle(new CloseCashShiftCommand(shift.Id, 1580m, null), CancellationToken.None);

        // Frozen at close: a later receipt doesn't move the counted drawer.
        mediator.Send(Arg.Any<FSH.Modules.Customers.Contracts.v1.Ledger.GetCashCustomerReceiptsQuery>(), Arg.Any<CancellationToken>())
            .Returns(900m);
        var closed = await summaries.Handle(new GetCashShiftSummaryQuery(shift.Id), CancellationToken.None);
        closed.CashReceiptsTotal.ShouldBe(400m);
        closed.ExpectedCash.ShouldBe(1580m);
        closed.Variance.ShouldBe(0m);
    }

    public void Dispose() => _db.Dispose();
}
