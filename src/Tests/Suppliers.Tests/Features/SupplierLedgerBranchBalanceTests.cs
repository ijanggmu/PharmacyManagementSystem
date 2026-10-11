using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Features.v1.Ledger.GetSupplierLedger;
using FSH.Modules.Suppliers.Features.v1.Ledger.GetSupplierStatement;
using NSubstitute;

namespace Suppliers.Tests.Features;

/// <summary>Filtered to one branch, ledger and statement balances come from that branch's entries only,
/// not the supplier's tenant-wide running balance.</summary>
public sealed class SupplierLedgerBranchBalanceTests : IDisposable
{
    private readonly SuppliersDbContext _db = SuppliersDbContextFactory.Create();
    private readonly Guid _branchA = Guid.CreateVersion7();
    private readonly Guid _branchB = Guid.CreateVersion7();
    private readonly DateTime _day1 = new(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc);

    public void Dispose() => _db.Dispose();

    private static ICurrentBranch Branch(Guid? resolved)
    {
        var branch = Substitute.For<ICurrentBranch>();
        branch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(resolved);
        return branch;
    }

    private async Task<Guid> SeedAsync()
    {
        var supplier = Supplier.Create("Himal Pharma", null, null, null, null, null, 0m);
        _db.Suppliers.Add(supplier);

        // Interleaved across branches; RunningBalance is the tenant-wide figure the aggregate keeps.
        (Guid Branch, int Day, decimal Debit, decimal Credit)[] moves =
        [
            (_branchA, 0, 100m, 0m),
            (_branchB, 1, 500m, 0m),
            (_branchA, 2, 0m, 30m),
            (_branchB, 3, 0m, 200m),
            (_branchA, 4, 50m, 0m),
        ];
        foreach (var (branch, day, debit, credit) in moves)
        {
            decimal running = supplier.ApplyLedgerEntry(debit, credit);
            _db.SupplierLedgerEntries.Add(SupplierLedgerEntry.Create(
                supplier.Id, _day1.AddDays(day), debit > 0 ? SupplierLedgerEntryType.Purchase : SupplierLedgerEntryType.Payment,
                null, debit, credit, running, branchId: branch));
        }

        await _db.SaveChangesAsync();
        return supplier.Id;
    }

    [Fact]
    public async Task Ledger_Should_RecomputeRunningBalance_ForTheFilteredBranch()
    {
        var supplierId = await SeedAsync();

        var page = await new GetSupplierLedgerQueryHandler(_db, Branch(_branchA))
            .Handle(new GetSupplierLedgerQuery(supplierId, PageNumber: 1, PageSize: 2), CancellationToken.None);
        var page2 = await new GetSupplierLedgerQueryHandler(_db, Branch(_branchA))
            .Handle(new GetSupplierLedgerQuery(supplierId, PageNumber: 2, PageSize: 2), CancellationToken.None);

        // Branch A: +100, -30, +50 → balances 100, 70, 120 (newest first across pages).
        page.Items.Select(i => i.RunningBalance).ShouldBe([120m, 70m]);
        page2.Items.Select(i => i.RunningBalance).ShouldBe([100m]);
    }

    [Fact]
    public async Task Ledger_Should_KeepStoredRunningBalance_WhenUnfiltered()
    {
        var supplierId = await SeedAsync();

        var page = await new GetSupplierLedgerQueryHandler(_db, Branch(null))
            .Handle(new GetSupplierLedgerQuery(supplierId), CancellationToken.None);

        page.Items.First().RunningBalance.ShouldBe(420m);
    }

    [Fact]
    public async Task Statement_Should_UseTheBranchOpeningAndClosing()
    {
        var supplierId = await SeedAsync();

        var statement = await new GetSupplierStatementQueryHandler(_db, Branch(_branchA))
            .Handle(new GetSupplierStatementQuery(supplierId, _day1.AddDays(1), _day1.AddDays(10)), CancellationToken.None);

        statement.OpeningBalance.ShouldBe(100m);
        statement.Lines.Select(l => l.RunningBalance).ShouldBe([70m, 120m]);
        statement.ClosingBalance.ShouldBe(120m);
    }
}
