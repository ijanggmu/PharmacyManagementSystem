using FSH.Framework.Core.Exceptions;
using FSH.Modules.Customers.Contracts.Services;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.IntegrationEventHandlers;
using FSH.Modules.Customers.Services;
using FSH.Modules.Sales.Contracts.Events;
using Microsoft.EntityFrameworkCore;

namespace Customers.Tests.Features;

/// <summary>
/// The customer side of a sale: the synchronous posting (credit limit / points checked against the
/// current balance) and the reversal of AR and loyalty on cancel / return / refund — each idempotent.
/// </summary>
public sealed class SaleReversalHandlersTests : IDisposable
{
    private readonly CustomersDbContext _db = CustomersDbContextFactory.Create();
    private readonly Guid _branchId = Guid.CreateVersion7();

    private async Task<Customer> SeedCustomerAsync(decimal balance = 0m, decimal? creditLimit = null, int points = 0)
    {
        var customer = Customer.Create("Jane Doe", null, null, null, balance, "C-000001", creditLimit);
        customer.SetMembership(true);
        if (points > 0)
        {
            customer.ApplyLoyaltyPoints(points, out _);
        }

        _db.Customers.Add(customer);
        await _db.SaveChangesAsync(CancellationToken.None);
        return customer;
    }

    /// <summary>A sale of 200 that left <paramref name="balanceDue"/> on account, redeemed 10 points and earned 20.</summary>
    private async Task<Guid> SeedSaleHistoryAsync(Customer customer, decimal balanceDue)
    {
        var saleId = Guid.CreateVersion7();
        var posting = new CustomerSalePostingService(_db);
        await posting.PostSaleAsync(new CustomerSalePosting(customer.Id, saleId, _branchId, balanceDue, 10, false, "INV-1"));
        int balance = customer.ApplyLoyaltyPoints(20, out int applied);
        _db.CustomerLoyaltyEntries.Add(CustomerLoyaltyEntry.Create(customer.Id, LoyaltyEntryType.Earn, applied, balance, "earned", saleId, _branchId));
        await _db.SaveChangesAsync(CancellationToken.None);
        return saleId;
    }

    // ---- synchronous posting -----------------------------------------------------------------------

    [Fact]
    public async Task Posting_Should_Refuse_A_Sale_Past_The_Credit_Limit()
    {
        var customer = await SeedCustomerAsync(balance: 90m, creditLimit: 100m);
        var sut = new CustomerSalePostingService(_db);

        var ex = await Should.ThrowAsync<CustomException>(() =>
            sut.PostSaleAsync(new CustomerSalePosting(customer.Id, Guid.CreateVersion7(), _branchId, 20m, 0, false, null)));

        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
        ex.Message.ShouldContain("10.00");
    }

    [Fact]
    public async Task Second_Sale_Should_See_The_First_Sales_Balance()
    {
        // The balance is updated inside each sale, so a back-to-back second sale is checked against 160, not 90.
        var customer = await SeedCustomerAsync(balance: 90m, creditLimit: 200m);
        var sut = new CustomerSalePostingService(_db);

        await sut.PostSaleAsync(new CustomerSalePosting(customer.Id, Guid.CreateVersion7(), _branchId, 70m, 0, false, null));
        await Should.ThrowAsync<CustomException>(() =>
            sut.PostSaleAsync(new CustomerSalePosting(customer.Id, Guid.CreateVersion7(), _branchId, 70m, 0, false, null)));

        customer.CurrentBalance.ShouldBe(160m);
    }

    [Fact]
    public async Task Posting_Should_Allow_The_Override()
    {
        var customer = await SeedCustomerAsync(balance: 90m, creditLimit: 100m);

        await new CustomerSalePostingService(_db)
            .PostSaleAsync(new CustomerSalePosting(customer.Id, Guid.CreateVersion7(), _branchId, 20m, 0, true, null));

        customer.CurrentBalance.ShouldBe(110m);
    }

    [Fact]
    public async Task Redeeming_More_Points_Than_Held_Should_Fail_Not_Clamp()
    {
        var customer = await SeedCustomerAsync(points: 5);

        await Should.ThrowAsync<CustomException>(() => new CustomerSalePostingService(_db)
            .PostSaleAsync(new CustomerSalePosting(customer.Id, Guid.CreateVersion7(), _branchId, 0m, 10, false, null)));

        customer.LoyaltyPoints.ShouldBe(5);
    }

    [Fact]
    public async Task Posting_Twice_For_The_Same_Sale_Should_Apply_Once_And_SaleCompleted_Should_Skip_It()
    {
        var customer = await SeedCustomerAsync(points: 50);
        var saleId = Guid.CreateVersion7();
        var sut = new CustomerSalePostingService(_db);

        await sut.PostSaleAsync(new CustomerSalePosting(customer.Id, saleId, _branchId, 40m, 10, false, null));
        await sut.PostSaleAsync(new CustomerSalePosting(customer.Id, saleId, _branchId, 40m, 10, false, null));

        customer.CurrentBalance.ShouldBe(40m);
        customer.LoyaltyPoints.ShouldBe(40);
        (await _db.CustomerLedgerEntries.CountAsync()).ShouldBe(1);
        (await _db.CustomerLoyaltyEntries.CountAsync()).ShouldBe(1);
    }

    // ---- cancellation -------------------------------------------------------------------------------

    [Fact]
    public async Task Cancel_Should_Credit_The_Balance_And_Reverse_Loyalty_Once()
    {
        var customer = await SeedCustomerAsync(points: 50);
        var saleId = await SeedSaleHistoryAsync(customer, balanceDue: 120m);
        customer.CurrentBalance.ShouldBe(120m);
        customer.LoyaltyPoints.ShouldBe(60); // 50 - 10 redeemed + 20 earned

        var evt = new SaleCancelledIntegrationEvent(
            Guid.CreateVersion7(), DateTime.UtcNow, "test-tenant", "c", "Sales", saleId, "void", [],
            BranchId: _branchId, CustomerId: customer.Id, OnAccountAmount: 120m, InvoiceNumber: "INV-1");
        var sut = new SaleCancelledIntegrationEventHandler(_db);

        await sut.HandleAsync(evt);
        await sut.HandleAsync(evt with { Id = Guid.CreateVersion7() }); // redelivered under a new id

        customer.CurrentBalance.ShouldBe(0m);
        customer.LoyaltyPoints.ShouldBe(50); // 20 earned taken back, 10 redeemed given back
        var reversals = await _db.CustomerLoyaltyEntries
            .Where(e => e.EntryType == LoyaltyEntryType.EarnReversed || e.EntryType == LoyaltyEntryType.RedeemRestored)
            .ToListAsync();
        reversals.Count.ShouldBe(2);
        (await _db.CustomerLedgerEntries.CountAsync(e => e.ReferenceType == "SaleCancellation")).ShouldBe(1);
    }

    // ---- returns / refunds ----------------------------------------------------------------------------

    [Fact]
    public async Task Partial_Returns_Should_Reverse_Loyalty_Pro_Rata_And_Fully_At_The_End()
    {
        var customer = await SeedCustomerAsync(points: 50);
        var saleId = await SeedSaleHistoryAsync(customer, balanceDue: 0m);
        var sut = new ReturnCompletedIntegrationEventHandler(_db);

        // Return 30% of the sale, then the remaining 70%.
        await sut.HandleAsync(ReturnEvent(customer.Id, saleId, amount: 60m, reversedToDate: 60m));
        customer.LoyaltyPoints.ShouldBe(57); // 60 - 6 earned (30% of 20) + 3 redeemed (30% of 10)

        await sut.HandleAsync(ReturnEvent(customer.Id, saleId, amount: 140m, reversedToDate: 200m));
        customer.LoyaltyPoints.ShouldBe(50); // everything earned taken back, everything redeemed given back
    }

    [Fact]
    public async Task Refund_Of_A_Credit_Sale_Should_Credit_AR_For_The_On_Account_Part()
    {
        var customer = await SeedCustomerAsync(points: 50);
        var saleId = await SeedSaleHistoryAsync(customer, balanceDue: 120m);
        var refundId = Guid.CreateVersion7();
        var evt = new RefundCompletedIntegrationEvent(
            Guid.CreateVersion7(), DateTime.UtcNow, "test-tenant", "c", "Sales", refundId, saleId, _branchId,
            NetRefundAmount: 100m, CustomerId: customer.Id, GrossRefundAmount: 100m, VatAmount: 11.5m,
            CashAmount: 0m, BankAmount: 0m, OnAccountAmount: 100m, SaleTotalAmount: 200m, ItemsAmount: 100m,
            CreditNoteNumber: "CN-1", ReversedToDateAmount: 100m);
        var sut = new RefundCompletedIntegrationEventHandler(_db);

        await sut.HandleAsync(evt);
        await sut.HandleAsync(evt);

        customer.CurrentBalance.ShouldBe(20m);
        var credit = await _db.CustomerLedgerEntries.SingleAsync(e => e.ReferenceType == "SaleRefund");
        credit.CreditAmount.ShouldBe(100m);
        credit.ReferenceId.ShouldBe(refundId);
        credit.DocumentNumber.ShouldBe("CN-1");
    }

    [Fact]
    public async Task Walk_In_Reversal_Should_Do_Nothing()
    {
        var evt = ReturnEvent(Guid.Empty, Guid.CreateVersion7(), 10m, 10m) with { CustomerId = null };

        await new ReturnCompletedIntegrationEventHandler(_db).HandleAsync(evt);

        _db.CustomerLedgerEntries.ShouldBeEmpty();
    }

    private ReturnCompletedIntegrationEvent ReturnEvent(Guid customerId, Guid saleId, decimal amount, decimal reversedToDate) =>
        new(Guid.CreateVersion7(), DateTime.UtcNow, "test-tenant", "c", "Sales", Guid.CreateVersion7(), saleId, _branchId,
            amount, [], CustomerId: customerId, VatAmount: 0m, CashAmount: amount, SaleTotalAmount: 200m,
            ReversedToDateAmount: reversedToDate);

    public void Dispose() => _db.Dispose();
}
