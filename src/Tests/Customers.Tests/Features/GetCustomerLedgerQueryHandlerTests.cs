using FSH.Modules.Customers.Contracts.v1.Ledger;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.Features.v1.Ledger.GetCustomerLedger;
using NSubstitute;

namespace Customers.Tests.Features;

public sealed class GetCustomerLedgerQueryHandlerTests : IDisposable
{
    private readonly CustomersDbContext _db = CustomersDbContextFactory.Create();
    // Caller holding Branches.ViewAll: an explicit branch filter passes through, null means all branches.
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly GetCustomerLedgerQueryHandler _sut;

    public GetCustomerLedgerQueryHandlerTests()
    {
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0));
        _sut = new GetCustomerLedgerQueryHandler(_db, _currentBranch);
    }

    [Fact]
    public async Task Handle_Should_FilterByBranchId_When_Provided()
    {
        var customerId = Guid.CreateVersion7();
        var branchA = Guid.CreateVersion7();
        var branchB = Guid.CreateVersion7();

        _db.CustomerLedgerEntries.Add(CustomerLedgerEntry.Create(
            customerId, DateTime.UtcNow, CustomerLedgerEntryType.Sale, "A", 10m, 0m, 10m, branchId: branchA));
        _db.CustomerLedgerEntries.Add(CustomerLedgerEntry.Create(
            customerId, DateTime.UtcNow, CustomerLedgerEntryType.Sale, "B", 20m, 0m, 30m, branchId: branchB));
        await _db.SaveChangesAsync(CancellationToken.None);

        var result = await _sut.Handle(new GetCustomerLedgerQuery(customerId, BranchId: branchA), CancellationToken.None);

        result.Items.Count.ShouldBe(1);
        result.Items.ElementAt(0).Description.ShouldBe("A");
        result.Items.ElementAt(0).BranchId.ShouldBe(branchA);
    }

    [Fact]
    public async Task Handle_Should_ReturnAllBranches_When_BranchIdNotProvided()
    {
        var customerId = Guid.CreateVersion7();
        _db.CustomerLedgerEntries.Add(CustomerLedgerEntry.Create(
            customerId, DateTime.UtcNow, CustomerLedgerEntryType.Sale, "A", 10m, 0m, 10m, branchId: Guid.CreateVersion7()));
        _db.CustomerLedgerEntries.Add(CustomerLedgerEntry.Create(
            customerId, DateTime.UtcNow, CustomerLedgerEntryType.Sale, "B", 20m, 0m, 30m, branchId: null));
        await _db.SaveChangesAsync(CancellationToken.None);

        var result = await _sut.Handle(new GetCustomerLedgerQuery(customerId), CancellationToken.None);

        result.Items.Count.ShouldBe(2);
    }

    public void Dispose() => _db.Dispose();
}
