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
        _sut = new CreateRefundCommandHandler(_db, _outbox, _currentUser, _currentBranch, _invoiceNumbers);
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
        await _invoiceNumbers.Received(1).ReserveNextCreditNoteAsync(_branchId, fiscalYear, Arg.Any<CancellationToken>());
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
        ex.Message.ShouldContain("already refunded");
    }

    [Fact]
    public async Task Handle_Should_Ignore_A_Client_Tax_Refund_Because_Prices_Include_Vat()
    {
        // Sale total 10 x 5 = 50. Refunding 6 units pays back 30; the old "tax refund" on top would have
        // paid the VAT a second time.
        var sale = await SeedCompletedSaleAsync(quantity: 10m, unitPrice: 5m);
        var command = new CreateRefundCommand(
            sale.Id, sale.CustomerId, DateTime.UtcNow, "Overcharged",
            [new RefundItemInput(sale.Items[0].Id, 6m)],
            TaxRefundAmount: 30m);

        var refundId = await _sut.Handle(command, CancellationToken.None);

        var saved = await _db.SaleRefunds.Include(r => r.Items).FirstAsync(r => r.Id == refundId);
        saved.TaxRefundAmount.ShouldBe(0m);
        saved.NetRefundAmount.ShouldBe(30m);
    }

    [Fact]
    public async Task Handle_Should_Throw_When_NetRefundAmount_ExceedsSaleTotal()
    {
        // Sale total 10 x 5 = 50. An older refund already paid back 40 (2 units + a legacy tax of 30), so
        // 3 more units (15) would pay back 55 in all.
        var sale = await SeedCompletedSaleAsync(quantity: 10m, unitPrice: 5m);
        var saleItem = sale.Items[0];
        var older = SaleRefund.Create(_branchId, sale.Id, null, DateTime.UtcNow, RefundStatus.Completed, "Old", "partial_refund", "cash", 0m, null);
        older.AddItem(saleItem.Id, saleItem.MedicineId, 2m, 5m);
        typeof(SaleRefund).GetField("<TaxRefundAmount>k__BackingField", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!
            .SetValue(older, 30m);
        _db.SaleRefunds.Add(older);
        await _db.SaveChangesAsync(CancellationToken.None);

        var command = new CreateRefundCommand(
            sale.Id, sale.CustomerId, DateTime.UtcNow, "Overclaim", [new RefundItemInput(saleItem.Id, 3m)]);

        var ex = await Should.ThrowAsync<CustomException>(() => _sut.Handle(command, CancellationToken.None).AsTask());
        ex.Message.ShouldContain("exceed");
    }

    [Fact]
    public async Task Handle_Should_Refund_What_The_Customer_Paid_After_The_Line_Discount()
    {
        // 4 units at Rs 25 with a Rs 20 line discount: the customer paid 80, i.e. 20 a unit, not 25.
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), Guid.CreateVersion7(), null, null);
        sale.AddItem(Guid.CreateVersion7(), 4m, 25m, 20m, 0m, 10m);
        sale.Finalize("Cash", sale.TotalAmount);
        _db.Sales.Add(sale);
        await _db.SaveChangesAsync(CancellationToken.None);

        var refundId = await _sut.Handle(
            new CreateRefundCommand(sale.Id, sale.CustomerId, DateTime.UtcNow, "Overcharged", [new RefundItemInput(sale.Items[0].Id, 4m)]),
            CancellationToken.None);

        var saved = await _db.SaleRefunds.Include(r => r.Items).FirstAsync(r => r.Id == refundId);
        saved.NetRefundAmount.ShouldBe(80m);
    }

    [Fact]
    public async Task Handle_Should_Throw_When_The_Units_Were_Already_Returned()
    {
        // A return already gave back (and paid out) all 10 units; refunding them again would pay twice.
        var sale = await SeedCompletedSaleAsync(quantity: 10m, unitPrice: 5m);
        var saleItem = sale.Items[0];
        var saleReturn = SaleReturn.Create(_branchId, sale.Id, null, DateTime.UtcNow, ReturnStatus.Completed, "Returned", null);
        saleReturn.AddItem(saleItem.Id, saleItem.MedicineId, 10m, 5m, 3m, "Returned", PackagingCondition.Sealed);
        _db.SaleReturns.Add(saleReturn);
        await _db.SaveChangesAsync(CancellationToken.None);

        var command = new CreateRefundCommand(
            sale.Id, sale.CustomerId, DateTime.UtcNow, "Again", [new RefundItemInput(saleItem.Id, 1m)]);

        var ex = await Should.ThrowAsync<CustomException>(() => _sut.Handle(command, CancellationToken.None).AsTask());
        ex.Message.ShouldContain("already returned");
    }

    [Fact]
    public async Task Handle_Should_Throw_When_SaleNotFound()
    {
        var command = new CreateRefundCommand(
            Guid.CreateVersion7(), null, DateTime.UtcNow, "x", [new RefundItemInput(Guid.CreateVersion7(), 1m)]);

        await Should.ThrowAsync<NotFoundException>(() => _sut.Handle(command, CancellationToken.None).AsTask());
    }

    [Fact]
    public async Task Handle_Should_Refuse_A_Cancelled_Sale()
    {
        var sale = await SeedCompletedSaleAsync(quantity: 2m, unitPrice: 10m);
        sale.Cancel("Rung up by mistake");
        await _db.SaveChangesAsync(CancellationToken.None);

        var command = new CreateRefundCommand(
            sale.Id, sale.CustomerId, DateTime.UtcNow, "x", [new RefundItemInput(sale.Items[0].Id, 1m)]);

        var ex = await Should.ThrowAsync<CustomException>(() => _sut.Handle(command, CancellationToken.None).AsTask());
        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
    }

    #endregion

    #region Where the money goes

    [Theory]
    [InlineData("card", "original_payment", 0, 40)]   // back to the card: from the bank
    [InlineData("card", "cash", 40, 0)]               // handed over in cash: from the drawer
    [InlineData("Cash", "original_payment", 40, 0)]   // a cash sale refunded to its payment: the drawer
    public async Task Handle_Should_Pay_Out_From_The_Drawer_Or_The_Bank(string paidBy, string refundMethod, decimal cash, decimal bank)
    {
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), null, null, null);
        sale.AddItem(Guid.CreateVersion7(), 10m, 20m, 0m, 0m, 12m);
        sale.Finalize(paidBy, sale.TotalAmount);
        _db.Sales.Add(sale);
        await _db.SaveChangesAsync(CancellationToken.None);

        var refundId = await _sut.Handle(
            new CreateRefundCommand(sale.Id, null, DateTime.UtcNow, "Overcharged", [new RefundItemInput(sale.Items[0].Id, 2m)],
                RefundMethod: refundMethod),
            CancellationToken.None);

        var refund = await _db.SaleRefunds.FirstAsync(r => r.Id == refundId);
        refund.CashPaidOut.ShouldBe(cash);
        refund.BankPaidOut.ShouldBe(bank);
    }

    #endregion

    #region Customer account

    private async Task<Sale> SeedCreditSaleAsync(decimal paid)
    {
        // 10 x 20 = 200, of which only `paid` was paid; the rest is owed on the customer's account.
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), Guid.CreateVersion7(), null, null);
        sale.AddItem(Guid.CreateVersion7(), 10m, 20m, 0m, 0m, 12m);
        sale.Finalize("Cash", paid);
        _db.Sales.Add(sale);
        await _db.SaveChangesAsync(CancellationToken.None);
        return sale;
    }

    [Fact]
    public async Task Handle_Should_Clear_What_The_Customer_Owes_Before_Paying_Cash()
    {
        var sale = await SeedCreditSaleAsync(paid: 150m); // owes 50

        var refundId = await _sut.Handle(
            new CreateRefundCommand(sale.Id, null, DateTime.UtcNow, "Overcharged", [new RefundItemInput(sale.Items[0].Id, 4m)]),
            CancellationToken.None);

        var refund = await _db.SaleRefunds.Include(r => r.Items).FirstAsync(r => r.Id == refundId);
        refund.NetRefundAmount.ShouldBe(80m);
        refund.AccountCreditAmount.ShouldBe(50m); // the 50 owed is cleared; 30 is paid out
        refund.CustomerId.ShouldBe(sale.CustomerId);

        // A second refund finds nothing left owed on the sale and pays out in full.
        var secondId = await _sut.Handle(
            new CreateRefundCommand(sale.Id, null, DateTime.UtcNow, "Again", [new RefundItemInput(sale.Items[0].Id, 1m)]),
            CancellationToken.None);
        (await _db.SaleRefunds.FirstAsync(r => r.Id == secondId)).AccountCreditAmount.ShouldBe(0m);
    }

    [Fact]
    public async Task Handle_Should_Put_A_Store_Credit_Refund_Wholly_On_The_Account()
    {
        var sale = await SeedCreditSaleAsync(paid: 200m); // paid in full

        var refundId = await _sut.Handle(
            new CreateRefundCommand(
                sale.Id, null, DateTime.UtcNow, "Goodwill", [new RefundItemInput(sale.Items[0].Id, 2m)],
                RefundMethod: "store_credit"),
            CancellationToken.None);

        (await _db.SaleRefunds.Include(r => r.Items).FirstAsync(r => r.Id == refundId)).AccountCreditAmount.ShouldBe(40m);
    }

    #endregion

    public void Dispose() => _db.Dispose();
}
