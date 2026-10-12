using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.IntegrationEventHandlers;
using FSH.Modules.Reference.Contracts.v1.TenantSettings;
using FSH.Modules.Sales.Contracts.Events;
using Mediator;
using NSubstitute;

namespace Customers.Tests.Features;

public sealed class SaleCompletedIntegrationEventHandlerTests : IDisposable
{
    private readonly CustomersDbContext _db = CustomersDbContextFactory.Create();

    private readonly IMediator _mediator = Substitute.For<IMediator>();

    public SaleCompletedIntegrationEventHandlerTests()
    {
        // Loyalty off unless a test turns it on.
        UseLoyaltySettings(new Dictionary<string, string>());
    }

    private void UseLoyaltySettings(Dictionary<string, string> settings) =>
        _mediator.Send(Arg.Any<GetTenantSettingsQuery>(), Arg.Any<CancellationToken>()).Returns(settings);

    private SaleCompletedIntegrationEventHandler CreateSut() => new(_db, _mediator);

    // ---- loyalty -----------------------------------------------------------------------------

    private static readonly Dictionary<string, string> LoyaltyOn = new()
    {
        ["loyalty.enabled"] = "true",
        ["loyalty.amount_per_point"] = "100",
        ["loyalty.point_value"] = "1",
    };

    [Fact]
    public async Task Members_Should_Earn_One_Point_Per_Amount_Spent()
    {
        UseLoyaltySettings(LoyaltyOn);
        var customer = await SeedCustomerAsync();
        customer.SetMembership(true);

        await CreateSut().HandleAsync(BuildEvent(customer.Id, Guid.CreateVersion7(), 0m) with { TotalAmount = 1250m }, CancellationToken.None);

        customer.LoyaltyPoints.ShouldBe(12);
        var entry = _db.CustomerLoyaltyEntries.ShouldHaveSingleItem();
        entry.EntryType.ShouldBe(LoyaltyEntryType.Earn);
        entry.BalanceAfter.ShouldBe(12);
        _db.CustomerLedgerEntries.ShouldBeEmpty();
    }

    [Fact]
    public async Task Non_Members_Should_Not_Earn()
    {
        UseLoyaltySettings(LoyaltyOn);
        var customer = await SeedCustomerAsync();

        await CreateSut().HandleAsync(BuildEvent(customer.Id, Guid.CreateVersion7(), 0m) with { TotalAmount = 1250m }, CancellationToken.None);

        customer.LoyaltyPoints.ShouldBe(0);
        _db.CustomerLoyaltyEntries.ShouldBeEmpty();
    }

    [Fact]
    public async Task Redeemed_Points_Should_Be_Taken_Off_Then_New_Points_Earned()
    {
        UseLoyaltySettings(LoyaltyOn);
        var customer = await SeedCustomerAsync();
        customer.SetMembership(true);
        customer.ApplyLoyaltyPoints(40, out _);

        await CreateSut().HandleAsync(
            BuildEvent(customer.Id, Guid.CreateVersion7(), 0m) with { TotalAmount = 500m, LoyaltyPointsRedeemed = 30 },
            CancellationToken.None);

        customer.LoyaltyPoints.ShouldBe(40 - 30 + 5);
        _db.CustomerLoyaltyEntries.Select(e => e.EntryType).ShouldBe([LoyaltyEntryType.Redeem, LoyaltyEntryType.Earn], ignoreOrder: true);
    }

    [Fact]
    public async Task Redeeming_More_Than_Held_Should_Stop_At_Zero()
    {
        var customer = await SeedCustomerAsync();
        customer.ApplyLoyaltyPoints(10, out _);

        await CreateSut().HandleAsync(
            BuildEvent(customer.Id, Guid.CreateVersion7(), 0m) with { LoyaltyPointsRedeemed = 25 },
            CancellationToken.None);

        customer.LoyaltyPoints.ShouldBe(0);
        _db.CustomerLoyaltyEntries.ShouldHaveSingleItem().Points.ShouldBe(-10);
    }

    private async Task<Customer> SeedCustomerAsync()
    {
        var customer = Customer.Create("Jane Doe", null, null, null, 0m, "C-000001");
        _db.Customers.Add(customer);
        await _db.SaveChangesAsync(CancellationToken.None);
        return customer;
    }

    private static SaleCompletedIntegrationEvent BuildEvent(Guid customerId, Guid branchId, decimal balanceDue) =>
        new(
            Guid.CreateVersion7(), DateTime.UtcNow, "test-tenant", Guid.CreateVersion7().ToString(), "Sales",
            SaleId: Guid.CreateVersion7(), BranchId: branchId, CustomerId: customerId, PrescriptionId: null,
            PaymentMethod: "credit", PaymentAmount: 0m, TotalAmount: balanceDue, BalanceDue: balanceDue,
            VatAmount: 0m, TotalCost: 0m, Lines: []);

    [Fact]
    public async Task HandleAsync_Should_StampBranchId_FromEvent()
    {
        var branchId = Guid.CreateVersion7();
        var customer = await SeedCustomerAsync();
        var sut = CreateSut();

        await sut.HandleAsync(BuildEvent(customer.Id, branchId, 50m), CancellationToken.None);

        var entry = _db.CustomerLedgerEntries.Single(e => e.CustomerId == customer.Id);
        entry.BranchId.ShouldBe(branchId);
        entry.EntryType.ShouldBe(CustomerLedgerEntryType.Sale);
    }

    [Fact]
    public async Task HandleAsync_Should_Carry_The_Invoice_Number()
    {
        var customer = await SeedCustomerAsync();

        await CreateSut().HandleAsync(
            BuildEvent(customer.Id, Guid.CreateVersion7(), 50m) with { InvoiceNumber = "INV-MAIN-2083/84-00012" },
            CancellationToken.None);

        var entry = _db.CustomerLedgerEntries.Single(e => e.CustomerId == customer.Id);
        entry.DocumentNumber.ShouldBe("INV-MAIN-2083/84-00012");
        entry.Description.ShouldBe("Sale INV-MAIN-2083/84-00012");
    }

    [Fact]
    public async Task HandleAsync_Should_BeNoOp_When_BalanceDueIsZero()
    {
        var customer = await SeedCustomerAsync();
        var sut = CreateSut();

        await sut.HandleAsync(BuildEvent(customer.Id, Guid.CreateVersion7(), 0m), CancellationToken.None);

        _db.CustomerLedgerEntries.Count(e => e.CustomerId == customer.Id).ShouldBe(0);
    }

    [Fact]
    public async Task Redelivered_Event_Should_Not_Apply_The_Sale_Twice()
    {
        UseLoyaltySettings(LoyaltyOn);
        var customer = await SeedCustomerAsync();
        customer.SetMembership(true);
        var @event = BuildEvent(customer.Id, Guid.CreateVersion7(), 300m) with { TotalAmount = 1000m };

        await CreateSut().HandleAsync(@event, CancellationToken.None);
        await CreateSut().HandleAsync(@event, CancellationToken.None);

        customer.CurrentBalance.ShouldBe(300m);
        customer.LoyaltyPoints.ShouldBe(10);
        _db.CustomerLedgerEntries.ShouldHaveSingleItem();
        _db.CustomerLoyaltyEntries.ShouldHaveSingleItem();
    }

    public void Dispose() => _db.Dispose();
}
