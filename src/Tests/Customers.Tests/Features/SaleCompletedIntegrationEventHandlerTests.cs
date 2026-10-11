using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.IntegrationEventHandlers;
using FSH.Modules.Sales.Contracts.Events;

namespace Customers.Tests.Features;

public sealed class SaleCompletedIntegrationEventHandlerTests : IDisposable
{
    private readonly CustomersDbContext _db = CustomersDbContextFactory.Create();

    private SaleCompletedIntegrationEventHandler CreateSut() => new(_db);

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

    public void Dispose() => _db.Dispose();
}
