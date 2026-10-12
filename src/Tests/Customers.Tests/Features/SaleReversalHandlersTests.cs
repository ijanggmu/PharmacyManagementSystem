using FSH.Framework.Core.Exceptions;
using FSH.Modules.Customers.Contracts.Services;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.IntegrationEventHandlers;
using FSH.Modules.Customers.Services;
using FSH.Modules.Reference.Contracts.v1.TenantSettings;
using FSH.Modules.Sales.Contracts.Events;
using Mediator;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

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
        int balance = (await CurrentAsync(customer.Id)).ApplyLoyaltyPoints(20, out int applied);
        _db.CustomerLoyaltyEntries.Add(CustomerLoyaltyEntry.Create(customer.Id, LoyaltyEntryType.Earn, applied, balance, "earned", saleId, _branchId));
        await _db.SaveChangesAsync(CancellationToken.None);
        return saleId;
    }

    /// <summary>The customer as the context tracks it now (the posting service clears the change tracker and
    /// re-reads the row, so an instance seeded earlier is stale).</summary>
    private Task<Customer> CurrentAsync(Guid customerId) =>
        _db.Customers.IgnoreQueryFilters().SingleAsync(c => c.Id == customerId);

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

        (await CurrentAsync(customer.Id)).CurrentBalance.ShouldBe(160m);
    }

    [Fact]
    public async Task Posting_Should_Allow_The_Override()
    {
        var customer = await SeedCustomerAsync(balance: 90m, creditLimit: 100m);

        await new CustomerSalePostingService(_db)
            .PostSaleAsync(new CustomerSalePosting(customer.Id, Guid.CreateVersion7(), _branchId, 20m, 0, true, null));

        (await CurrentAsync(customer.Id)).CurrentBalance.ShouldBe(110m);
    }

    [Fact]
    public async Task Redeeming_More_Points_Than_Held_Should_Fail_Not_Clamp()
    {
        var customer = await SeedCustomerAsync(points: 5);

        await Should.ThrowAsync<CustomException>(() => new CustomerSalePostingService(_db)
            .PostSaleAsync(new CustomerSalePosting(customer.Id, Guid.CreateVersion7(), _branchId, 0m, 10, false, null)));

        (await CurrentAsync(customer.Id)).LoyaltyPoints.ShouldBe(5);
    }

    [Fact]
    public async Task Posting_Twice_For_The_Same_Sale_Should_Apply_Once_And_SaleCompleted_Should_Skip_It()
    {
        var customer = await SeedCustomerAsync(points: 50);
        var saleId = Guid.CreateVersion7();
        var sut = new CustomerSalePostingService(_db);

        await sut.PostSaleAsync(new CustomerSalePosting(customer.Id, saleId, _branchId, 40m, 10, false, null));
        await sut.PostSaleAsync(new CustomerSalePosting(customer.Id, saleId, _branchId, 40m, 10, false, null));

        (await CurrentAsync(customer.Id)).CurrentBalance.ShouldBe(40m);
        (await CurrentAsync(customer.Id)).LoyaltyPoints.ShouldBe(40);
        (await _db.CustomerLedgerEntries.CountAsync()).ShouldBe(1);
        (await _db.CustomerLoyaltyEntries.CountAsync()).ShouldBe(1);
    }

    // ---- cancellation -------------------------------------------------------------------------------

    [Fact]
    public async Task Cancel_Should_Credit_The_Balance_And_Reverse_Loyalty_Once()
    {
        var customer = await SeedCustomerAsync(points: 50);
        var saleId = await SeedSaleHistoryAsync(customer, balanceDue: 120m);
        (await CurrentAsync(customer.Id)).CurrentBalance.ShouldBe(120m);
        (await CurrentAsync(customer.Id)).LoyaltyPoints.ShouldBe(60); // 50 - 10 redeemed + 20 earned

        var evt = new SaleCancelledIntegrationEvent(
            Guid.CreateVersion7(), DateTime.UtcNow, "test-tenant", "c", "Sales", saleId, "void", [],
            BranchId: _branchId, CustomerId: customer.Id, OnAccountAmount: 120m, InvoiceNumber: "INV-1");
        var sut = new SaleCancelledIntegrationEventHandler(_db);

        await sut.HandleAsync(evt);
        await sut.HandleAsync(evt with { Id = Guid.CreateVersion7() }); // redelivered under a new id

        (await CurrentAsync(customer.Id)).CurrentBalance.ShouldBe(0m);
        (await CurrentAsync(customer.Id)).LoyaltyPoints.ShouldBe(50); // 20 earned taken back, 10 redeemed given back
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
        (await CurrentAsync(customer.Id)).LoyaltyPoints.ShouldBe(57); // 60 - 6 earned (30% of 20) + 3 redeemed (30% of 10)

        await sut.HandleAsync(ReturnEvent(customer.Id, saleId, amount: 140m, reversedToDate: 200m));
        (await CurrentAsync(customer.Id)).LoyaltyPoints.ShouldBe(50); // everything earned taken back, everything redeemed given back
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

        (await CurrentAsync(customer.Id)).CurrentBalance.ShouldBe(20m);
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

    // ---- inactive / deleted customers, retried sales ---------------------------------------------------

    [Fact]
    public async Task Posting_To_An_Inactive_Customer_Should_Be_A_Conflict()
    {
        var customer = await SeedCustomerAsync(points: 50);
        customer.Update(customer.Name, null, null, null, isActive: false);
        await _db.SaveChangesAsync();

        var ex = await Should.ThrowAsync<CustomException>(() => new CustomerSalePostingService(_db)
            .PostSaleAsync(new CustomerSalePosting(customer.Id, Guid.CreateVersion7(), _branchId, 20m, 0, false, null)));

        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
        ex.Message.ShouldContain("inactive");
        (await _db.CustomerLedgerEntries.CountAsync()).ShouldBe(0);
    }

    [Fact]
    public async Task Posting_To_A_Deleted_Customer_Should_Be_A_Conflict_Not_A_404()
    {
        var customer = await SeedCustomerAsync(points: 50);
        _db.Entry(customer).Property(c => c.IsDeleted).CurrentValue = true;
        await _db.SaveChangesAsync();

        var ex = await Should.ThrowAsync<CustomException>(() => new CustomerSalePostingService(_db)
            .PostSaleAsync(new CustomerSalePosting(customer.Id, Guid.CreateVersion7(), _branchId, 0m, 10, false, null)));

        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
        ex.Message.ShouldContain("deleted");
    }

    [Fact]
    public async Task Posting_Should_Not_Resave_Rows_Left_Tracked_By_A_Failed_Earlier_Attempt()
    {
        // A sale retried after a deadlock runs again in the same scope: the first attempt's Added rows are
        // still tracked. They must be dropped, not inserted a second time (duplicate key → 500).
        var customer = await SeedCustomerAsync();
        _db.CustomerLedgerEntries.Add(CustomerLedgerEntry.Create(
            customer.Id, DateTime.UtcNow, CustomerLedgerEntryType.Adjustment, "stale", 5m, 0m, 5m));

        await new CustomerSalePostingService(_db)
            .PostSaleAsync(new CustomerSalePosting(customer.Id, Guid.CreateVersion7(), _branchId, 30m, 0, false, null));

        (await _db.CustomerLedgerEntries.AsNoTracking().CountAsync()).ShouldBe(1);
        (await CurrentAsync(customer.Id)).CurrentBalance.ShouldBe(30m);
    }

    // ---- SaleCompleted handled after the reversal (outbox retry / out of order) ----------------------------

    private static readonly Dictionary<string, string> LoyaltyOn = new()
    {
        ["loyalty.enabled"] = "true",
        ["loyalty.amount_per_point"] = "10",
        ["loyalty.point_value"] = "1",
    };

    private SaleCompletedIntegrationEventHandler SaleCompletedHandler()
    {
        var mediator = Substitute.For<IMediator>();
        mediator.Send(Arg.Any<GetTenantSettingsQuery>(), Arg.Any<CancellationToken>()).Returns(LoyaltyOn);
        return new SaleCompletedIntegrationEventHandler(_db, mediator);
    }

    private SaleCompletedIntegrationEvent CompletedEvent(Guid customerId, Guid saleId, decimal total) =>
        new(Guid.CreateVersion7(), DateTime.UtcNow, "test-tenant", "c", "Sales", saleId, _branchId, customerId, null,
            "cash", total, total, 0m, 0m, 0m, [], InvoiceNumber: "INV-9");

    [Fact]
    public async Task SaleCompleted_After_The_Cancellation_Should_Not_Earn()
    {
        var customer = await SeedCustomerAsync(points: 5);
        var saleId = Guid.CreateVersion7();

        await new SaleCancelledIntegrationEventHandler(_db).HandleAsync(new SaleCancelledIntegrationEvent(
            Guid.CreateVersion7(), DateTime.UtcNow, "test-tenant", "c", "Sales", saleId, "void", [],
            BranchId: _branchId, CustomerId: customer.Id, OnAccountAmount: 0m, InvoiceNumber: "INV-9"));
        await SaleCompletedHandler().HandleAsync(CompletedEvent(customer.Id, saleId, 200m));

        (await CurrentAsync(customer.Id)).LoyaltyPoints.ShouldBe(5);
        (await _db.CustomerLoyaltyEntries.CountAsync(e => e.EntryType == LoyaltyEntryType.Earn)).ShouldBe(0);
    }

    [Fact]
    public async Task SaleCompleted_After_A_Partial_Return_Should_Earn_Only_On_What_Was_Kept()
    {
        var customer = await SeedCustomerAsync();
        var saleId = Guid.CreateVersion7();

        // 30% of the 200 sale returned before the sale's points were earned.
        await new ReturnCompletedIntegrationEventHandler(_db).HandleAsync(ReturnEvent(customer.Id, saleId, 60m, 60m));
        await SaleCompletedHandler().HandleAsync(CompletedEvent(customer.Id, saleId, 200m));

        (await CurrentAsync(customer.Id)).LoyaltyPoints.ShouldBe(14); // 20 earned, 6 (30%) taken straight back

        // The rest comes back later: everything earned ends up reversed.
        await new ReturnCompletedIntegrationEventHandler(_db).HandleAsync(ReturnEvent(customer.Id, saleId, 140m, 200m));
        (await CurrentAsync(customer.Id)).LoyaltyPoints.ShouldBe(0);
    }

    [Fact]
    public async Task Old_Cancel_Event_Without_Customer_Should_Credit_AR_From_The_Sale_Ledger_Entry()
    {
        var customer = await SeedCustomerAsync();
        var saleId = Guid.CreateVersion7();
        await new CustomerSalePostingService(_db)
            .PostSaleAsync(new CustomerSalePosting(customer.Id, saleId, _branchId, 75m, 0, false, "INV-7"));

        // Queued before CustomerId/OnAccountAmount existed on the event.
        await new SaleCancelledIntegrationEventHandler(_db).HandleAsync(new SaleCancelledIntegrationEvent(
            Guid.CreateVersion7(), DateTime.UtcNow, "test-tenant", "c", "Sales", saleId, "void", []));

        (await CurrentAsync(customer.Id)).CurrentBalance.ShouldBe(0m);
        var credit = await _db.CustomerLedgerEntries.SingleAsync(e => e.ReferenceType == "SaleCancellation");
        credit.CreditAmount.ShouldBe(75m);
        credit.CustomerId.ShouldBe(customer.Id);
    }

    [Fact]
    public async Task Old_Cancel_Event_For_A_Sale_That_Never_Touched_A_Customer_Should_Do_Nothing()
    {
        await new SaleCancelledIntegrationEventHandler(_db).HandleAsync(new SaleCancelledIntegrationEvent(
            Guid.CreateVersion7(), DateTime.UtcNow, "test-tenant", "c", "Sales", Guid.CreateVersion7(), "void", []));

        _db.CustomerLedgerEntries.ShouldBeEmpty();
    }

    private ReturnCompletedIntegrationEvent ReturnEvent(Guid customerId, Guid saleId, decimal amount, decimal reversedToDate) =>
        new(Guid.CreateVersion7(), DateTime.UtcNow, "test-tenant", "c", "Sales", Guid.CreateVersion7(), saleId, _branchId,
            amount, [], CustomerId: customerId, VatAmount: 0m, CashAmount: amount, SaleTotalAmount: 200m,
            ReversedToDateAmount: reversedToDate);

    public void Dispose() => _db.Dispose();
}
