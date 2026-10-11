using FSH.Modules.Customers.Contracts.v1.Ledger;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.Features.v1.Ledger.GetCustomerLedger;
using FSH.Modules.Multitenancy.Contracts;
using NSubstitute;

namespace Customers.Tests.Features;

/// <summary>Filtered to one branch, running balances come from that branch's entries only.</summary>
public sealed class CustomerLedgerBranchBalanceTests : IDisposable
{
    private readonly CustomersDbContext _db = CustomersDbContextFactory.Create();
    private readonly Guid _branchA = Guid.CreateVersion7();
    private readonly Guid _branchB = Guid.CreateVersion7();

    public void Dispose() => _db.Dispose();

    [Fact]
    public async Task Ledger_Should_RecomputeRunningBalance_ForTheFilteredBranch()
    {
        var customer = Customer.Create("Ram", null, null, null, 0m);
        _db.Customers.Add(customer);
        var day = new DateTime(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc);
        (Guid Branch, decimal Debit, decimal Credit)[] moves =
        [
            (_branchA, 300m, 0m),
            (_branchB, 1000m, 0m),
            (_branchA, 0m, 100m),
        ];
        for (int i = 0; i < moves.Length; i++)
        {
            var (branch, debit, credit) = moves[i];
            decimal running = customer.ApplyLedgerEntry(debit, credit);
            _db.CustomerLedgerEntries.Add(CustomerLedgerEntry.Create(
                customer.Id, day.AddDays(i), debit > 0 ? CustomerLedgerEntryType.Sale : CustomerLedgerEntryType.Payment,
                null, debit, credit, running, branchId: branch));
        }

        await _db.SaveChangesAsync();

        var currentBranch = Substitute.For<ICurrentBranch>();
        currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns((Guid?)_branchA);

        var page = await new GetCustomerLedgerQueryHandler(_db, currentBranch)
            .Handle(new GetCustomerLedgerQuery(customer.Id), CancellationToken.None);

        // Branch A: +300, -100 → 300 then 200 (newest first); branch B's 1000 is not in these balances.
        page.Items.Select(i => i.RunningBalance).ShouldBe([200m, 300m]);
    }
}
