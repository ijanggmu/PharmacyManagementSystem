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
    public async Task Branch_Filter_Should_Apply_Payments_Made_At_Other_Branches_First()
    {
        // 100 owed at A (40 days old), 50 owed at B (5 days old), 100 paid at B. FIFO across branches settles
        // the A debt; branch A's aging must show nothing open, branch B's the 50.
        var branchA = Guid.CreateVersion7();
        var branchB = Guid.CreateVersion7();
        var customer = Customer.Create("Ram", null, null, null, 0m, "C-000001");
        _db.Customers.Add(customer);
        var asOf = DateTime.UtcNow;
        _db.CustomerLedgerEntries.AddRange(
            CustomerLedgerEntry.Create(customer.Id, asOf.AddDays(-40), CustomerLedgerEntryType.Sale, "A", 100m, 0m, 100m, branchId: branchA),
            CustomerLedgerEntry.Create(customer.Id, asOf.AddDays(-5), CustomerLedgerEntryType.Sale, "B", 50m, 0m, 150m, branchId: branchB),
            CustomerLedgerEntry.Create(customer.Id, asOf.AddDays(-2), CustomerLedgerEntryType.Payment, "paid at B", 0m, 100m, 50m, branchId: branchB));
        await _db.SaveChangesAsync(CancellationToken.None);

        (await _sut.Handle(new GetArAgingReportQuery(asOf, branchA), CancellationToken.None)).ShouldBeEmpty();

        var atB = await _sut.Handle(new GetArAgingReportQuery(asOf, branchB), CancellationToken.None);
        atB.Count.ShouldBe(1);
        atB[0].Current.ShouldBe(50m);
        atB[0].Total.ShouldBe(50m);

        var all = await _sut.Handle(new GetArAgingReportQuery(asOf), CancellationToken.None);
        all.Single().Total.ShouldBe(50m);
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
