using FSH.Modules.Customers.Contracts.v1.Ledger;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.Features.v1.Ledger.GetTotalArBalance;

namespace Customers.Tests.Features;

public sealed class GetTotalArBalanceQueryHandlerTests : IDisposable
{
    private readonly CustomersDbContext _db = CustomersDbContextFactory.Create();
    private readonly GetTotalArBalanceQueryHandler _sut;
    private readonly Guid _branchA = Guid.CreateVersion7();
    private readonly Guid _branchB = Guid.CreateVersion7();

    public GetTotalArBalanceQueryHandlerTests()
    {
        _sut = new GetTotalArBalanceQueryHandler(_db);
    }

    public void Dispose() => _db.Dispose();

    [Fact]
    public async Task Handle_Should_SumCustomerCurrentBalances_When_BranchIdOmitted()
    {
        _db.Customers.AddRange(
            Customer.Create("A", null, null, null, 120m),
            Customer.Create("B", null, null, null, 80m));
        await _db.SaveChangesAsync(CancellationToken.None);

        var result = await _sut.Handle(new GetTotalArBalanceQuery(), CancellationToken.None);

        result.ShouldBe(200m);
    }

    [Fact]
    public async Task Handle_Should_NetOnlyThatBranchLedgerEntries_When_BranchIdProvided()
    {
        var customer = Customer.Create("A", null, null, null, 0m);
        _db.Customers.Add(customer);
        var now = DateTime.UtcNow;
        _db.CustomerLedgerEntries.AddRange(
            CustomerLedgerEntry.Create(customer.Id, now, CustomerLedgerEntryType.Sale, "A sale", 150m, 0m, 150m, branchId: _branchA),
            CustomerLedgerEntry.Create(customer.Id, now, CustomerLedgerEntryType.Payment, "A pay", 0m, 50m, 100m, branchId: _branchA),
            CustomerLedgerEntry.Create(customer.Id, now, CustomerLedgerEntryType.Sale, "B sale", 70m, 0m, 170m, branchId: _branchB),
            // Legacy row with no branch: it belongs to no single branch, so it is in no per-branch total.
            CustomerLedgerEntry.Create(customer.Id, now, CustomerLedgerEntryType.OpeningBalance, "Legacy", 30m, 0m, 200m, branchId: null));
        await _db.SaveChangesAsync(CancellationToken.None);

        (await _sut.Handle(new GetTotalArBalanceQuery(_branchA), CancellationToken.None)).ShouldBe(100m);
        (await _sut.Handle(new GetTotalArBalanceQuery(_branchB), CancellationToken.None)).ShouldBe(70m);
    }

    [Fact]
    public async Task Handle_Should_ReturnZero_When_BranchHasNoLedgerEntries()
    {
        var result = await _sut.Handle(new GetTotalArBalanceQuery(_branchA), CancellationToken.None);

        result.ShouldBe(0m);
    }
}
