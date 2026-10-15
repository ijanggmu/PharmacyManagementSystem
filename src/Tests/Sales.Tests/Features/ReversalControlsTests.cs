using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Reference.Contracts.Dtos;
using FSH.Modules.Reference.Contracts.v1.Settings;
using FSH.Modules.Sales.Contracts.v1.Refunds;
using FSH.Modules.Sales.Contracts.v1.Returns;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Refunds.CreateRefund;
using FSH.Modules.Sales.Features.v1.Refunds.UpdateRefundStatus;
using FSH.Modules.Sales.Features.v1.Returns.CreateReturn;
using FSH.Modules.Sales.Features.v1.Returns.UpdateReturnStatus;
using FSH.Modules.Sales.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using NSubstitute.ExceptionExtensions;

namespace Sales.Tests.Features;

/// <summary>
/// The money controls on returns and refunds: the refund approval threshold on a return created completed, the
/// open-cash-shift rule on cash paid out, the last reversal taking the VAT the sale has left, the processing fee cap
/// and the accepted refund methods.
/// </summary>
public sealed class ReversalControlsTests : IDisposable
{
    private readonly SalesDbContext _db = SalesDbContextFactory.Create();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly IInvoiceNumberService _invoiceNumbers = Substitute.For<IInvoiceNumberService>();
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly ISaleControls _saleControls = Substitute.For<ISaleControls>();
    private readonly Guid _branchId = Guid.CreateVersion7();

    public ReversalControlsTests()
    {
        _currentUser.GetTenant().Returns("test-tenant");
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
        _invoiceNumbers.ResolveContextAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>())
            .Returns(new InvoiceNumberContext("INV", "MAIN"));
        _invoiceNumbers.ReserveNextCreditNoteAsync(Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns(1, 2, 3, 4, 5);
#pragma warning disable CA2012 // NSubstitute stores the ValueTask as a configured return value.
        _mediator.Send(Arg.Any<GetPharmacySettingsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new PharmacySettingsDto(Guid.CreateVersion7(), "Test Pharmacy", null, null, null, "NPR", 13m, "INV", 1, null));
#pragma warning restore CA2012
    }

    public void Dispose() => _db.Dispose();

    private CreateReturnCommandHandler Returns() => new(_db, _outbox, _currentUser, _currentBranch, _mediator, _invoiceNumbers, _saleControls);

    private CreateRefundCommandHandler Refunds() => new(_db, _outbox, _currentUser, _currentBranch, _invoiceNumbers, _mediator, _saleControls);

    private UpdateReturnStatusCommandHandler UpdateReturn() => new(_db, _outbox, _currentUser, _currentBranch, _mediator, _invoiceNumbers, _saleControls);

    private UpdateRefundStatusCommandHandler UpdateRefund() => new(_db, _outbox, _currentUser, _currentBranch, _mediator, _invoiceNumbers, _saleControls);

    private async Task<Sale> SeedSaleAsync(decimal quantity, decimal unitPrice, string method = "cash")
    {
        var sale = Sale.StartBuilding(_branchId, null, null, null);
        sale.AddItem(Guid.CreateVersion7(), quantity, unitPrice, 0m, 0m, unitPrice / 2m);
        sale.Finalize([new SaleTender(method, sale.TotalAmount, null)], shortfallIsOnAccount: false);
        sale.ApplyVat(13m);
        _db.Sales.Add(sale);
        await _db.SaveChangesAsync();
        return sale;
    }

    private async Task OpenShiftAsync()
    {
        _db.CashShifts.Add(CashShift.Open(_branchId, "cashier", 0m, null));
        await _db.SaveChangesAsync();
    }

    private static CreateReturnCommand ReturnOf(
        Sale sale, decimal quantity, string status = "completed", string? method = "cash", IReadOnlyList<string>? tokens = null) =>
        new(sale.Id, null, DateTime.UtcNow, [new ReturnItemInput(sale.Items[0].Id, quantity, "damaged", "sealed")],
            Status: status, RefundMethod: method, ApprovalTokens: tokens);

    private static CreateRefundCommand RefundOf(Sale sale, decimal quantity, string status = "completed", string method = "cash", decimal fee = 0m) =>
        new(sale.Id, null, DateTime.UtcNow, "defective", [new RefundItemInput(sale.Items[0].Id, quantity)],
            Status: status, RefundMethod: method, ProcessingFee: fee);

    #region Refund approval threshold on returns

    [Fact]
    public async Task Completed_Cash_Return_Should_Be_Held_To_The_Refund_Approval_Threshold_With_Its_Tokens()
    {
        var sale = await SeedSaleAsync(3m, 1000m);

        await Returns().Handle(ReturnOf(sale, 3m, tokens: ["apv_1"]), CancellationToken.None);

        await _saleControls.Received(1).EnsureRefundAllowedAsync(
            sale.Id, 3000m, Arg.Is<IReadOnlyList<string>?>(t => t!.Single() == "apv_1"), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Completed_Return_Refused_For_Approval_Should_Not_Be_Recorded()
    {
        var sale = await SeedSaleAsync(3m, 1000m);
#pragma warning disable CA2012 // NSubstitute stores the ValueTask as a configured return value.
        _saleControls.EnsureRefundAllowedAsync(Guid.Empty, default, default, default)
            .ReturnsForAnyArgs(_ => throw new ForbiddenException("approval_required"));
#pragma warning restore CA2012

        await Should.ThrowAsync<ForbiddenException>(() => Returns().Handle(ReturnOf(sale, 3m), CancellationToken.None).AsTask());

        _db.ChangeTracker.Clear();
        (await _db.SaleReturns.CountAsync()).ShouldBe(0);
        await _outbox.DidNotReceiveWithAnyArgs().AddAsync(default!, default);
    }

    [Fact]
    public async Task Pending_Return_Should_Not_Need_An_Approval_Yet()
    {
        var sale = await SeedSaleAsync(3m, 1000m);

        await Returns().Handle(ReturnOf(sale, 3m, status: "pending"), CancellationToken.None);

        await _saleControls.DidNotReceiveWithAnyArgs().EnsureRefundAllowedAsync(Guid.Empty, default, default, default);
    }

    #endregion

    #region Open cash shift on cash payouts

    [Fact]
    public async Task Cash_Return_Should_Need_An_Open_Shift_When_The_Tenant_Requires_One()
    {
        _saleControls.RequiresOpenShiftAsync(Arg.Any<CancellationToken>()).Returns(true);
        var sale = await SeedSaleAsync(2m, 100m);

        var ex = await Should.ThrowAsync<CustomException>(() => Returns().Handle(ReturnOf(sale, 1m), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
        ex.ErrorMessages.ShouldContain("cash_shift_required");
        // Refused before the completion is published (on PostgreSQL the whole transaction rolls back; the InMemory
        // provider used here has no transactions, so only the missing event is asserted).
        await _outbox.DidNotReceiveWithAnyArgs().AddAsync(default!, default);
    }

    [Fact]
    public async Task Cash_Return_Should_Pass_With_An_Open_Shift()
    {
        _saleControls.RequiresOpenShiftAsync(Arg.Any<CancellationToken>()).Returns(true);
        await OpenShiftAsync();
        var sale = await SeedSaleAsync(2m, 100m);

        var id = await Returns().Handle(ReturnOf(sale, 1m), CancellationToken.None);

        (await _db.SaleReturns.FirstAsync(r => r.Id == id)).StockRestoredAtUtc.ShouldNotBeNull();
    }

    [Fact]
    public async Task Non_Cash_Return_And_Refund_Should_Not_Need_A_Shift()
    {
        _saleControls.RequiresOpenShiftAsync(Arg.Any<CancellationToken>()).Returns(true);
        var sale = await SeedSaleAsync(4m, 100m, method: "esewa");

        await Returns().Handle(ReturnOf(sale, 1m, method: "original_payment"), CancellationToken.None);
        await Refunds().Handle(RefundOf(sale, 1m, method: "bank_transfer"), CancellationToken.None);

        (await _db.SaleReturns.CountAsync()).ShouldBe(1);
        (await _db.SaleRefunds.CountAsync()).ShouldBe(1);
    }

    [Fact]
    public async Task Cash_Refund_Should_Need_An_Open_Shift()
    {
        _saleControls.RequiresOpenShiftAsync(Arg.Any<CancellationToken>()).Returns(true);
        var sale = await SeedSaleAsync(2m, 100m);

        var ex = await Should.ThrowAsync<CustomException>(() => Refunds().Handle(RefundOf(sale, 1m), CancellationToken.None).AsTask());

        ex.ErrorMessages.ShouldContain("cash_shift_required");
    }

    [Fact]
    public async Task Completing_A_Pending_Cash_Return_Or_Refund_Should_Need_An_Open_Shift()
    {
        var sale = await SeedSaleAsync(4m, 100m);
        var returnId = await Returns().Handle(ReturnOf(sale, 1m, status: "pending"), CancellationToken.None);
        var refundId = await Refunds().Handle(RefundOf(sale, 1m, status: "pending"), CancellationToken.None);
        _saleControls.RequiresOpenShiftAsync(Arg.Any<CancellationToken>()).Returns(true);

        (await Should.ThrowAsync<CustomException>(
                () => UpdateReturn().Handle(new UpdateReturnStatusCommand(returnId, "completed"), CancellationToken.None).AsTask()))
            .ErrorMessages.ShouldContain("cash_shift_required");
        _db.ChangeTracker.Clear();
        (await Should.ThrowAsync<CustomException>(
                () => UpdateRefund().Handle(new UpdateRefundStatusCommand(refundId, "completed"), CancellationToken.None).AsTask()))
            .ErrorMessages.ShouldContain("cash_shift_required");
    }

    #endregion

    #region VAT residual

    [Fact]
    public async Task Sale_Reversed_In_Pieces_Should_Reverse_Exactly_Its_Vat()
    {
        // 3 x 1.00 at 13%: the sale's VAT is 0.35, but each unit on its own rounds to 0.12 (0.36 in all).
        var sale = await SeedSaleAsync(3m, 1m);
        sale.VatAmount.ShouldBe(0.35m);

        await Returns().Handle(ReturnOf(sale, 1m), CancellationToken.None);
        await Refunds().Handle(RefundOf(sale, 1m), CancellationToken.None);
        var lastId = await Returns().Handle(ReturnOf(sale, 1m), CancellationToken.None);

        decimal returned = await _db.SaleReturns.SumAsync(r => r.VatAmount ?? 0m);
        decimal refunded = await _db.SaleRefunds.SumAsync(r => r.VatAmount ?? 0m);
        (returned + refunded).ShouldBe(0.35m);
        var last = await _db.SaleReturns.FirstAsync(r => r.Id == lastId);
        last.VatAmount.ShouldBe(0.11m);
        (last.TaxableAmount + last.VatAmount).ShouldBe(1m);
    }

    [Fact]
    public void WithVat_Should_Keep_The_Gross_And_Stay_Within_It()
    {
        var breakdown = new VatBreakdown(13m, 0.88m, 0.12m, 5m);

        breakdown.WithVat(0.11m).ShouldBe(new VatBreakdown(13m, 0.89m, 0.11m, 5m));
        breakdown.WithVat(2m).VatAmount.ShouldBe(1m);
        breakdown.WithVat(-1m).VatAmount.ShouldBe(0m);
    }

    #endregion

    #region Processing fee and refund methods

    [Fact]
    public async Task Refund_Should_Refuse_A_Processing_Fee_Above_The_Refund()
    {
        var sale = await SeedSaleAsync(2m, 100m);

        var ex = await Should.ThrowAsync<CustomException>(
            () => Refunds().Handle(RefundOf(sale, 1m, status: "pending", fee: 100.01m), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.BadRequest);
        (await _db.SaleRefunds.CountAsync()).ShouldBe(0);
    }

    [Fact]
    public async Task Refund_Should_Accept_A_Processing_Fee_Equal_To_The_Refund()
    {
        var sale = await SeedSaleAsync(2m, 100m);

        var id = await Refunds().Handle(RefundOf(sale, 1m, status: "pending", fee: 100m), CancellationToken.None);

        (await _db.SaleRefunds.Include(r => r.Items).FirstAsync(r => r.Id == id)).NetRefundAmount.ShouldBe(0m);
    }

    [Theory]
    [InlineData("bitcoin", false)]
    [InlineData("cash", true)]
    [InlineData(" Cash ", true)]
    [InlineData("original", true)]
    [InlineData("original_payment", true)]
    [InlineData("store_credit", true)]
    [InlineData("bank_transfer", true)]
    [InlineData("esewa", true)]
    [InlineData(null, true)]
    public void Validators_Should_Accept_Only_Known_Refund_Methods(string? method, bool valid)
    {
        var returnCommand = new CreateReturnCommand(
            Guid.CreateVersion7(), null, DateTime.UtcNow, [new ReturnItemInput(Guid.CreateVersion7(), 1m, "x")], RefundMethod: method);
        var refundCommand = new CreateRefundCommand(
            Guid.CreateVersion7(), null, DateTime.UtcNow, "x", [new RefundItemInput(Guid.CreateVersion7(), 1m)], RefundMethod: method!);

        new CreateReturnCommandValidator().Validate(returnCommand).IsValid.ShouldBe(valid);
        if (method is not null)
        {
            new CreateRefundCommandValidator().Validate(refundCommand).IsValid.ShouldBe(valid);
        }
    }

    [Fact]
    public void Return_Validator_Should_Limit_Approval_Tokens()
    {
        var command = new CreateReturnCommand(
            Guid.CreateVersion7(), null, DateTime.UtcNow, [new ReturnItemInput(Guid.CreateVersion7(), 1m, "x")],
            ApprovalTokens: ["a", "b", "c", "d", "e", "f"]);

        new CreateReturnCommandValidator().Validate(command).IsValid.ShouldBeFalse();
    }

    #endregion
}
