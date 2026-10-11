using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;
using Integration.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace Integration.Tests.Tests.Inventory;

/// <summary>
/// The duplicate-medicine, batch-number and barcode rules against real PostgreSQL: the
/// upper/btrim/replace translations of <see cref="MedicineIdentityGuard"/> and the case-insensitive
/// batch lookup, plus the unique barcode index from the AddUniqueMedicineBarcode migration.
/// Each test uses its own random names/codes, so they don't see other tests' rows.
/// </summary>
[Collection(FshCollectionDefinition.Name)]
public sealed class MedicineIdentityPostgresTests
{
    private readonly FshWebApplicationFactory _factory;

    public MedicineIdentityPostgresTests(FshWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task FindDuplicates_Should_Translate_And_Match_Ignoring_Case_And_Spaces()
    {
        string name = $"Dup {Guid.CreateVersion7():N}"[..20];
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);
        var db = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();

        var medicine = Medicine.Create(name, null, null, 0m, false, strength: "500 mg", form: "Tablet");
        db.Medicines.Add(medicine);
        await db.SaveChangesAsync();

        var matches = await MedicineIdentityGuard.FindDuplicatesAsync(
            db, $"  {name.ToUpperInvariant()} ", "500MG", "tablet", excludeId: null, CancellationToken.None);

        matches.ShouldHaveSingleItem().Id.ShouldBe(medicine.Id);
    }

    [Fact]
    public async Task Unique_Barcode_Index_Should_Reject_A_Second_Live_Medicine_With_The_Same_Barcode()
    {
        string barcode = Ean13.NewInStoreCode();
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);
        var db = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();

        db.Medicines.Add(Medicine.Create($"Bar {Guid.CreateVersion7():N}"[..20], null, null, 0m, false, barcode: barcode));
        await db.SaveChangesAsync();

        db.Medicines.Add(Medicine.Create($"Bar {Guid.CreateVersion7():N}"[..20], null, null, 0m, false, barcode: barcode));
        await Should.ThrowAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task StockReceipt_Should_Find_The_Lot_Case_Insensitively_On_Postgres()
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);
        var db = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();

        var medicine = Medicine.Create($"Lot {Guid.CreateVersion7():N}"[..20], null, null, 0m, false);
        db.Medicines.Add(medicine);
        var branchId = Guid.CreateVersion7();
        var expiry = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1));
        db.MedicineBatches.Add(MedicineBatch.Create(medicine.Id, branchId, "PCM 2401", expiry, 10m, 1m, 2m, null));
        await db.SaveChangesAsync();

        await new StockReceiptService(db, new FixedBranch(branchId)).ReceiveAsync(new FSH.Modules.Inventory.Contracts.Services.StockReceiptRequest(
            "GoodsReceipt", Guid.CreateVersion7(),
            [new FSH.Modules.Inventory.Contracts.Services.StockReceiptLine(medicine.Id, " pcm  2401 ", expiry, 5m, 1m, 2m)]));

        var lots = await db.MedicineBatches.AsNoTracking().Where(b => b.MedicineId == medicine.Id).ToListAsync();
        lots.ShouldHaveSingleItem().QuantityOnHand.ShouldBe(15m);
    }

    private async Task<(IServiceScope Scope, AppTenantInfo Tenant)> NewScopeAsync()
    {
        var scope = _factory.Services.CreateScope();
        var tenant = await scope.ServiceProvider
            .GetRequiredService<IMultiTenantStore<AppTenantInfo>>()
            .GetAsync(TestConstants.RootTenantId);
        return (scope, tenant!);
    }

    private sealed class FixedBranch(Guid branchId) : FSH.Modules.Multitenancy.Contracts.ICurrentBranch
    {
        public Task<Guid?> GetBranchIdAsync(CancellationToken cancellationToken = default) => Task.FromResult<Guid?>(branchId);

        public Task<Guid?> GetListFilterBranchIdAsync(CancellationToken cancellationToken = default) => Task.FromResult<Guid?>(branchId);

        public Task<Guid?> ResolveListBranchFilterAsync(Guid? requestedBranchId, CancellationToken cancellationToken = default) =>
            Task.FromResult<Guid?>(requestedBranchId ?? branchId);

        public Task<bool> CanViewAllBranchesAsync(CancellationToken cancellationToken = default) => Task.FromResult(false);

        public Task<Guid> RequireBranchIdAsync(CancellationToken cancellationToken = default) => Task.FromResult(branchId);
    }
}
