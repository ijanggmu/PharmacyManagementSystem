using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.IntegrationEventHandlers;
using FSH.Modules.Reference.Contracts.v1.TenantSettings;
using FSH.Modules.Sales.Contracts.Events;
using Mediator;
using NSubstitute;

namespace Customers.Tests.Features;

/// <summary>A cancelled sale and a refund undo what the completed sale put on the customer's account.</summary>
public sealed class SaleReversalHandlersTests : IDisposable
{
    private static readonly Dictionary<string, string> LoyaltyOn = new()
    {
        ["loyalty.enabled"] = "true",
        ["loyalty.amount_per_point"] = "100",
        ["loyalty.point_value"] = "1",
    };

    private readonly CustomersDbContext _db = CustomersDbContextFactory.Create();
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly Guid _branchId = Guid.CreateVersion7();

    public SaleReversalHandlersTests() =>
        _mediator.Send(Arg.Any<GetTenantSettingsQuery>(), Arg.Any<CancellationToken>()).Returns(LoyaltyOn);

    private async Task<(Customer Customer, Guid SaleId)> SeedCompletedCreditSaleAsync(decimal total, decimal balanceDue, int redeemed = 0)
    {
        var customer = Customer.Create("Jane Doe", null, null, null, 0m, "C-000001");
        customer.SetMembership(true);
        customer.ApplyLoyaltyPoints(50, out _);
        _db.Customers.Add(customer);
        await _db.SaveChangesAsync(CancellationToken.None);

        var saleId = Guid.CreateVersion7();
        await new SaleCompletedIntegrationEventHandler(_db, _mediator).HandleAsync(
            new SaleCompletedIntegrationEvent(
                Guid.CreateVersion7(), DateTime.UtcNow, "test-tenant", "c", "Sales",
                SaleId: saleId, BranchId: _branchId, CustomerId: customer.Id, PrescriptionId: null,
                PaymentMethod: "credit", PaymentAmount: total - balanceDue, TotalAmount: total, BalanceDue: balanceDue,
                VatAmount: 0m, TotalCost: 0m, Lines: [], LoyaltyPointsRedeemed: redeemed),
            CancellationToken.None);
        return (customer, saleId);
    }

    private static SaleCancelledIntegrationEvent Cancelled(Guid saleId, Guid branchId) =>
        new(Guid.CreateVersion7(), DateTime.UtcNow, "test-tenant", "c", "Sales", saleId, "Mistake", [], branchId);

    [Fact]
    public async Task A_Cancelled_Sale_Should_Clear_The_Balance_And_Undo_Its_Points()
    {
        var (customer, saleId) = await SeedCompletedCreditSaleAsync(total: 1000m, balanceDue: 600m, redeemed: 20);
        customer.CurrentBalance.ShouldBe(600m);
        customer.LoyaltyPoints.ShouldBe(50 - 20 + 10);

        var sut = new SaleCancelledIntegrationEventHandler(_db);
        await sut.HandleAsync(Cancelled(saleId, _branchId), CancellationToken.None);
        await sut.HandleAsync(Cancelled(saleId, _branchId), CancellationToken.None); // redelivered: no-op

        customer.CurrentBalance.ShouldBe(0m);
        customer.LoyaltyPoints.ShouldBe(50);
        _db.CustomerLedgerEntries.Count(e => e.ReferenceType == "SaleCancel").ShouldBe(1);
        _db.CustomerLoyaltyEntries.Count(e => e.EntryType == LoyaltyEntryType.EarnReversed).ShouldBe(1);
        _db.CustomerLoyaltyEntries.Count(e => e.EntryType == LoyaltyEntryType.RedeemReturned).ShouldBe(1);
    }

    [Fact]
    public async Task A_Refund_Should_Credit_The_Account_And_Take_Back_The_Points_It_Earned()
    {
        var (customer, saleId) = await SeedCompletedCreditSaleAsync(total: 1000m, balanceDue: 600m);
        var refundId = Guid.CreateVersion7();
        var refund = new RefundCompletedIntegrationEvent(
            Guid.CreateVersion7(), DateTime.UtcNow, "test-tenant", "c", "Sales",
            RefundId: refundId, OriginalSaleId: saleId, BranchId: _branchId, NetRefundAmount: 400m,
            AccountCreditAmount: 400m, CustomerId: customer.Id);

        var sut = new RefundCompletedIntegrationEventHandler(_db, _mediator);
        await sut.HandleAsync(refund, CancellationToken.None);
        await sut.HandleAsync(refund, CancellationToken.None); // redelivered: no-op

        customer.CurrentBalance.ShouldBe(200m);
        customer.LoyaltyPoints.ShouldBe(50 + 10 - 4); // earned 10 on 1000, 4 of them on the 400 refunded
        _db.CustomerLoyaltyEntries.Single(e => e.RefundId == refundId).Points.ShouldBe(-4);
    }

    public void Dispose() => _db.Dispose();
}
