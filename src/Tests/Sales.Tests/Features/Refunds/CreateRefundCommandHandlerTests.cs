using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Fiscal;
using FSH.Modules.Sales.Contracts.v1.Refunds;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Refunds.CreateRefund;
using FSH.Modules.Sales.Services;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Sales.Tests.Features.Refunds;

public sealed class CreateRefundCommandHandlerTests : IDisposable
{
    private readonly SalesDbContext _db = SalesDbContextFactory.Create();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly IInvoiceNumberService _invoiceNumbers = Substitute.For<IInvoiceNumberService>();
    private readonly Mediator.IMediator _mediator = Substitute.For<Mediator.IMediator>();
    private readonly Guid _branchId = Guid.CreateVersion7();
    private readonly CreateRefundCommandHandler _sut;

    public CreateRefundCommandHandlerTests()
    {
        _currentUser.GetTenant().Returns("test-tenant");
        _currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
        _invoiceNumbers.ResolveContextAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>())
            .Returns(new InvoiceNumberContext("INV", "MAIN"));
        _invoiceNumbers.ReserveNextCreditNoteAsync(Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns(1, 2, 3);
        _mediator.Send(Arg.Any<FSH.Modules.Reference.Contracts.v1.Settings.GetPharmacySettingsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new FSH.Modules.Reference.Contracts.Dtos.PharmacySettingsDto(Guid.CreateVersion7(), "Test Pharmacy", null, null, null, "NPR", 13m, "INV", 1, null));
        _sut = new CreateRefundCommandHandler(_db, _outbox, _currentUser, _currentBranch, _invoiceNumbers, _mediator, Substitute.For<ISaleControls>());
    }

    private async Task<Sale> SeedCompletedSaleAsync(decimal quantity = 10m, decimal unitPrice = 20m)
    {
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), Guid.CreateVersion7(), null, null);
        sale.AddItem(Guid.CreateVersion7(), quantity, unitPrice, 0m, 0m, 12m);
        sale.Finalize("Cash", sale.TotalAmount);
        _db.Sales.Add(sale);
        await _db.SaveChangesAsync(CancellationToken.None);
        return sale;
    }

    #region Happy Path

    [Fact]
    public async Task Handle_Should_CreateRefund_And_PostVoucher_When_StatusCompleted()
    {
        // Arrange — sale total = 10 x 20 = 200.
        var sale = await SeedCompletedSaleAsync(quantity: 10m, unitPrice: 20m);
        var saleItem = sale.Items[0];
        var command = new CreateRefundCommand(
            sale.Id, sale.CustomerId, DateTime.UtcNow, "Defective",
            [new RefundItemInput(saleItem.Id, 2m)],
            Status: "completed");

        // Act
        var refundId = await _sut.Handle(command, CancellationToken.None);

        // Assert
        refundId.ShouldNotBe(Guid.Empty);
        var saved = await _db.SaleRefunds.Include(r => r.Items).FirstAsync(r => r.Id == refundId);
        saved.Status.ShouldBe(RefundStatus.Completed);
        saved.NetRefundAmount.ShouldBe(40m); // 2 x 20
        int fiscalYear = NepalFiscalYear.StartYearFor(command.RefundDateUtc);
        saved.CreditNoteNumber.ShouldBe($"CN-MAIN-{NepalFiscalYear.Label(fiscalYear)}-00001");
        saved.FiscalYear.ShouldBe(fiscalYear);
        // The credit note is issued in the SALE's branch series, and the refund is stamped with that branch.
        saved.BranchId.ShouldBe(sale.BranchId);
        await _invoiceNumbers.Received(1).ReserveNextCreditNoteAsync(sale.BranchId, fiscalYear, Arg.Any<CancellationToken>());
        await _invoiceNumbers.DidNotReceive().ReserveNextAsync(Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>());
        await _outbox.Received(1).AddAsync(Arg.Any<FSH.Modules.Sales.Contracts.Events.RefundCompletedIntegrationEvent>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_Should_Split_Refund_Vat_From_The_Original_Sale()
    {
        // Arrange: 13% VAT sale with a taxable line (Rs 113 each) and an exempt line (Rs 50 each).
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), Guid.CreateVersion7(), null, null);
        sale.AddItem(Guid.CreateVersion7(), 2m, 113m, 0m, 0m, 80m, isTaxable: true);
        sale.AddItem(Guid.CreateVersion7(), 2m, 50m, 0m, 0m, 30m, isTaxable: false);
        sale.Finalize("Cash", sale.TotalAmount);
        sale.ApplyVat(13m);
        _db.Sales.Add(sale);
        await _db.SaveChangesAsync(CancellationToken.None);

        var command = new CreateRefundCommand(
            sale.Id, sale.CustomerId, DateTime.UtcNow, "Wrong item",
            [new RefundItemInput(sale.Items[0].Id, 1m), new RefundItemInput(sale.Items[1].Id, 1m)]);

        // Act
        var refundId = await _sut.Handle(command, CancellationToken.None);

        // Assert: VAT 13 is carved out of the refunded Rs 113 only; Rs 50 is exempt.
        var saved = await _db.SaleRefunds.FirstAsync(r => r.Id == refundId);
        saved.VatRatePercent.ShouldBe(13m);
        saved.VatAmount.ShouldBe(13m);
        saved.TaxableAmount.ShouldBe(100m);
        saved.ExemptAmount.ShouldBe(50m);
    }

    #endregion

    #region Guards

    [Fact]
    public async Task Handle_Should_Throw_When_DoubleRefunding_SameQuantity()
    {
        // Arrange — sold 10; first refund takes all 10, second attempts to refund again.
        var sale = await SeedCompletedSaleAsync(quantity: 10m, unitPrice: 5m);
        var saleItem = sale.Items[0];
        await _sut.Handle(
            new CreateRefundCommand(sale.Id, sale.CustomerId, DateTime.UtcNow, "First refund", [new RefundItemInput(saleItem.Id, 10m)]),
            CancellationToken.None);

        var second = new CreateRefundCommand(
            sale.Id, sale.CustomerId, DateTime.UtcNow, "Second refund attempt", [new RefundItemInput(saleItem.Id, 1m)]);

        // Act & Assert
        var ex = await Should.ThrowAsync<CustomException>(() => _sut.Handle(second, CancellationToken.None).AsTask());
        ex.Message.ShouldContain("already been returned or refunded");
    }

    [Fact]
    public async Task Handle_Should_Never_Add_A_Client_Tax_Amount_On_Top()
    {
        // Prices are VAT-inclusive: a client-sent tax amount is ignored (the validator rejects it at the edge),
        // so 6 units at 5 refund exactly 30, not 30 + tax.
        var sale = await SeedCompletedSaleAsync(quantity: 10m, unitPrice: 5m);
        var command = new CreateRefundCommand(
            sale.Id, sale.CustomerId, DateTime.UtcNow, "Overclaim",
            [new RefundItemInput(sale.Items[0].Id, 6m)],
            TaxRefundAmount: 30m);

        var refundId = await _sut.Handle(command, CancellationToken.None);

        var saved = await _db.SaleRefunds.Include(r => r.Items).FirstAsync(r => r.Id == refundId);
        saved.TaxRefundAmount.ShouldBe(0m);
        saved.NetRefundAmount.ShouldBe(30m);
    }

    [Fact]
    public void Validator_Should_Reject_A_Separate_Tax_Refund_Amount()
    {
        var validator = new CreateRefundCommandValidator();
        var command = new CreateRefundCommand(
            Guid.CreateVersion7(), null, DateTime.UtcNow, "x", [new RefundItemInput(Guid.CreateVersion7(), 1m)], TaxRefundAmount: 13m);

        var result = validator.Validate(command);

        result.IsValid.ShouldBeFalse();
        result.Errors.ShouldContain(e => e.PropertyName == nameof(CreateRefundCommand.TaxRefundAmount));
    }

    [Fact]
    public async Task Handle_Should_Throw_When_SaleNotFound()
    {
        var command = new CreateRefundCommand(
            Guid.CreateVersion7(), null, DateTime.UtcNow, "x", [new RefundItemInput(Guid.CreateVersion7(), 1m)]);

        await Should.ThrowAsync<NotFoundException>(() => _sut.Handle(command, CancellationToken.None).AsTask());
    }

    #endregion

    public void Dispose() => _db.Dispose();
}
