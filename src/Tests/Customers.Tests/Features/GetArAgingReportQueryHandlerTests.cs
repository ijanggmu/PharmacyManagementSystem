using FSH.Modules.Customers.Contracts.v1.Ledger;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.Features.v1.Ledger.GetArAgingReport;
using NSubstitute;

namespace Customers.Tests.Features;

public sealed class GetArAgingReportQueryHandlerTests : IDisposable
{
    private readonly CustomersDbContext _db = CustomersDbContextFactory.Create();
    // Caller holding Branches.ViewAll: an explicit branch filter passes through, null means all branches.
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly GetArAgingReportQueryHandler _sut;

    public GetArAgingReportQueryHandlerTests()
    {
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0));
        _sut = new GetArAgingReportQueryHandler(_db, _currentBranch);
    }

    [Fact]
    public async Task Handle_Should_FilterByBranchId_When_Provided()
    {
        var branchA = Guid.CreateVersion7();
        var branchB = Guid.CreateVersion7();
        var customerA = Customer.Create("A", null, null, null, 0m, "C-000001");
        var customerB = Customer.Create("B", null, null, null, 0m, "C-000001");
        _db.Customers.AddRange(customerA, customerB);

        var asOf = DateTime.UtcNow;
        _db.CustomerLedgerEntries.Add(CustomerLedgerEntry.Create(
            customerA.Id, asOf.AddDays(-5), CustomerLedgerEntryType.Sale, "A", 100m, 0m, 100m, branchId: branchA));
        _db.CustomerLedgerEntries.Add(CustomerLedgerEntry.Create(
            customerB.Id, asOf.AddDays(-5), CustomerLedgerEntryType.Sale, "B", 200m, 0m, 200m, branchId: branchB));
        await _db.SaveChangesAsync(CancellationToken.None);

        var result = await _sut.Handle(new GetArAgingReportQuery(asOf, branchA), CancellationToken.None);

        result.Count.ShouldBe(1);
        result[0].CustomerId.ShouldBe(customerA.Id);
    }

    [Fact]
    public async Task Handle_Should_ReturnAllBranches_When_BranchIdNotProvided()
    {
        var customerA = Customer.Create("A", null, null, null, 0m, "C-000001");
        var customerB = Customer.Create("B", null, null, null, 0m, "C-000001");
        _db.Customers.AddRange(customerA, customerB);

        var asOf = DateTime.UtcNow;
        _db.CustomerLedgerEntries.Add(CustomerLedgerEntry.Create(
            customerA.Id, asOf.AddDays(-5), CustomerLedgerEntryType.Sale, "A", 100m, 0m, 100m, branchId: Guid.CreateVersion7()));
        _db.CustomerLedgerEntries.Add(CustomerLedgerEntry.Create(
            customerB.Id, asOf.AddDays(-5), CustomerLedgerEntryType.Sale, "B", 200m, 0m, 200m, branchId: null));
        await _db.SaveChangesAsync(CancellationToken.None);

        var result = await _sut.Handle(new GetArAgingReportQuery(asOf), CancellationToken.None);

        result.Count.ShouldBe(2);
    }

    public void Dispose() => _db.Dispose();
}
