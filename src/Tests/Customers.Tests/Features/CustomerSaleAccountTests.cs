using FSH.Framework.Core.Exceptions;
using FSH.Modules.Customers.Contracts.Services;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.IntegrationEventHandlers;
using FSH.Modules.Customers.Services;
using FSH.Modules.Reference.Contracts.v1.TenantSettings;
using FSH.Modules.Sales.Contracts.Events;
using Mediator;
using NSubstitute;

namespace Customers.Tests.Features;

public sealed class CustomerSaleAccountTests : IDisposable
{
    private readonly CustomersDbContext _db = CustomersDbContextFactory.Create();

    private async Task<Customer> SeedAsync(decimal? creditLimit = null, int points = 0)
    {
        var customer = Customer.Create("Jane Doe", null, null, null, 0m, "C-000001", creditLimit);
        customer.SetMembership(true);
        if (points > 0)
        {
            customer.ApplyLoyaltyPoints(points, out _);
        }

        _db.Customers.Add(customer);
        await _db.SaveChangesAsync();
        return customer;
    }

    private Task Apply(Customer customer, decimal balanceDue, int points = 0, bool mayExceed = false) =>
        new CustomerSaleAccount(_db).ApplySaleAsync(
            new SaleAccountPosting(customer.Id, Guid.CreateVersion7(), Guid.CreateVersion7(), balanceDue, points, "INV-1", mayExceed));

    private Customer Reload(Guid id) => _db.Customers.Single(c => c.Id == id);

    [Fact]
    public async Task A_Second_Sale_Should_Be_Checked_Against_The_Balance_The_First_Left()
    {
        var customer = await SeedAsync(creditLimit: 15m);

        await Apply(customer, 10m);
        var ex = await Should.ThrowAsync<CustomException>(() => Apply(customer, 10m));

        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
        Reload(customer.Id).CurrentBalance.ShouldBe(10m);
    }

    [Fact]
    public async Task An_Approved_Override_Should_Go_Over_The_Limit()
    {
        var customer = await SeedAsync(creditLimit: 15m);

        await Apply(customer, 20m, mayExceed: true);

        Reload(customer.Id).CurrentBalance.ShouldBe(20m);
    }

    [Fact]
    public async Task Points_Should_Not_Be_Spent_Twice()
    {
        var customer = await SeedAsync(points: 500);

        await Apply(customer, 0m, points: 500);
        var ex = await Should.ThrowAsync<CustomException>(() => Apply(customer, 0m, points: 500));

        ex.Message.ShouldContain("0 points");
        Reload(customer.Id).LoyaltyPoints.ShouldBe(0);
    }

    [Fact]
    public async Task The_Completed_Sale_Handler_Should_Only_Add_The_Earned_Points_After_The_Sale_Posted()
    {
        var customer = await SeedAsync(points: 100);
        var saleId = Guid.CreateVersion7();
        await new CustomerSaleAccount(_db).ApplySaleAsync(
            new SaleAccountPosting(customer.Id, saleId, Guid.CreateVersion7(), 300m, 40, "INV-9", false));

        var mediator = Substitute.For<IMediator>();
        mediator.Send(Arg.Any<GetTenantSettingsQuery>(), Arg.Any<CancellationToken>()).Returns(new Dictionary<string, string>
        {
            ["loyalty.enabled"] = "true",
            ["loyalty.amount_per_point"] = "100",
            ["loyalty.point_value"] = "1",
        });
        await new SaleCompletedIntegrationEventHandler(_db, mediator).HandleAsync(
            new SaleCompletedIntegrationEvent(
                Guid.CreateVersion7(), DateTime.UtcNow, "test-tenant", "c", "Sales",
                SaleId: saleId, BranchId: Guid.CreateVersion7(), CustomerId: customer.Id, PrescriptionId: null,
                PaymentMethod: "credit", PaymentAmount: 200m, TotalAmount: 500m, BalanceDue: 300m,
                VatAmount: 0m, TotalCost: 0m, Lines: [], LoyaltyPointsRedeemed: 40),
            CancellationToken.None);

        var reloaded = Reload(customer.Id);
        reloaded.CurrentBalance.ShouldBe(300m);              // not posted twice
        reloaded.LoyaltyPoints.ShouldBe(100 - 40 + 5);        // redeemed once, then 5 earned on 500
        _db.CustomerLedgerEntries.Count(e => e.ReferenceId == saleId).ShouldBe(1);
        _db.CustomerLoyaltyEntries.Count(e => e.SaleId == saleId && e.EntryType == LoyaltyEntryType.Redeem).ShouldBe(1);
    }

    public void Dispose() => _db.Dispose();
}
