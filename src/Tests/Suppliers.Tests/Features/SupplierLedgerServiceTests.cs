using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Services;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Suppliers.Tests.Features;

public sealed class SupplierLedgerServiceTests
{
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly SuppliersDbContext _dbContext;
    private readonly SupplierLedgerService _sut;

    public SupplierLedgerServiceTests()
    {
        _dbContext = SuppliersDbContextFactory.Create();
        _sut = new SupplierLedgerService(_dbContext, _currentBranch);
    }

    private async Task<Supplier> SeedSupplierAsync()
    {
        var supplier = Supplier.Create("Acme Pharma", null, null, null, null, null, 0m);
        _dbContext.Suppliers.Add(supplier);
        await _dbContext.SaveChangesAsync();
        return supplier;
    }

    [Fact]
    public async Task RecordPurchaseAsync_Should_StampBranchId_From_ICurrentBranch()
    {
        var supplier = await SeedSupplierAsync();
        var branchId = Guid.CreateVersion7();
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(branchId);

        await _sut.RecordPurchaseAsync(supplier.Id, 100m, DateTime.UtcNow, "Received stock", "PurchaseOrder", Guid.CreateVersion7());

        var entry = await _dbContext.SupplierLedgerEntries.AsNoTracking().FirstAsync(e => e.SupplierId == supplier.Id);
        entry.BranchId.ShouldBe(branchId);
        entry.EntryType.ShouldBe(SupplierLedgerEntryType.Purchase);
    }

    [Fact]
    public async Task RecordPurchaseAsync_Should_PersistNullBranchId_When_ICurrentBranchReturnsNull()
    {
        var supplier = await SeedSupplierAsync();
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns((Guid?)null);

        await _sut.RecordPurchaseAsync(supplier.Id, 50m, DateTime.UtcNow, null, null, null);

        var entry = await _dbContext.SupplierLedgerEntries.AsNoTracking().FirstAsync(e => e.SupplierId == supplier.Id);
        entry.BranchId.ShouldBeNull();
    }

    [Fact]
    public async Task RecordReturnAsync_Should_StampBranchId_From_ICurrentBranch()
    {
        var supplier = await SeedSupplierAsync();
        var branchId = Guid.CreateVersion7();
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(branchId);

        await _sut.RecordReturnAsync(supplier.Id, 20m, DateTime.UtcNow, "Voided receipt", "DirectGoodsReceipt", Guid.CreateVersion7());

        var entry = await _dbContext.SupplierLedgerEntries.AsNoTracking().FirstAsync(e => e.SupplierId == supplier.Id);
        entry.BranchId.ShouldBe(branchId);
        entry.EntryType.ShouldBe(SupplierLedgerEntryType.Return);
    }
}
