using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Features.v1.Ledger.GetTotalApBalance;

namespace Suppliers.Tests.Features;

public sealed class GetTotalApBalanceQueryHandlerTests : IDisposable
{
    private readonly SuppliersDbContext _db = SuppliersDbContextFactory.Create();
    private readonly GetTotalApBalanceQueryHandler _sut;
    private readonly Guid _branchA = Guid.CreateVersion7();
    private readonly Guid _branchB = Guid.CreateVersion7();

    public GetTotalApBalanceQueryHandlerTests()
    {
        _sut = new GetTotalApBalanceQueryHandler(_db);
    }

    public void Dispose() => _db.Dispose();

    [Fact]
    public async Task Handle_Should_SumSupplierCurrentBalances_When_BranchIdOmitted()
    {
        _db.Suppliers.AddRange(
            Supplier.Create("A", null, null, null, null, null, 300m),
            Supplier.Create("B", null, null, null, null, null, 200m));
        await _db.SaveChangesAsync(CancellationToken.None);

        var result = await _sut.Handle(new GetTotalApBalanceQuery(), CancellationToken.None);

        result.ShouldBe(500m);
    }

    [Fact]
    public async Task Handle_Should_NetOnlyThatBranchLedgerEntries_When_BranchIdProvided()
    {
        var supplier = Supplier.Create("A", null, null, null, null, null, 0m);
        _db.Suppliers.Add(supplier);
        var now = DateTime.UtcNow;
        _db.SupplierLedgerEntries.AddRange(
            SupplierLedgerEntry.Create(supplier.Id, now, SupplierLedgerEntryType.Purchase, "A buy", 400m, 0m, 400m, branchId: _branchA),
            SupplierLedgerEntry.Create(supplier.Id, now, SupplierLedgerEntryType.Payment, "A pay", 0m, 150m, 250m, branchId: _branchA),
            SupplierLedgerEntry.Create(supplier.Id, now, SupplierLedgerEntryType.Purchase, "B buy", 90m, 0m, 340m, branchId: _branchB),
            // Legacy row with no branch: it belongs to no single branch, so it is in no per-branch total.
            SupplierLedgerEntry.Create(supplier.Id, now, SupplierLedgerEntryType.OpeningBalance, "Legacy", 60m, 0m, 400m, branchId: null));
        await _db.SaveChangesAsync(CancellationToken.None);

        (await _sut.Handle(new GetTotalApBalanceQuery(_branchA), CancellationToken.None)).ShouldBe(250m);
        (await _sut.Handle(new GetTotalApBalanceQuery(_branchB), CancellationToken.None)).ShouldBe(90m);
    }
}
