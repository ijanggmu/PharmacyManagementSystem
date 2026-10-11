using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Features.v1.Medicines.SearchMedicines;
using FSH.Modules.Inventory.Features.v1.Reports.GetReorderSuggestions;
using FSH.Modules.Inventory.Jobs;
using FSH.Modules.Inventory.Services;
using Integration.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Shouldly;

namespace Integration.Tests.Tests.Inventory;

/// <summary>
/// The inventory-integrity rules against real PostgreSQL: the expiry predicate inside the FEFO
/// <c>FOR UPDATE</c> lock query, the SQL-side stock aggregation/paging of the medicine list, the
/// lot-level restock (row locks in its own transaction), and the cross-tenant price-schedule job.
/// Each test works on its own fresh branch id and random names, so it never sees other tests' rows.
/// </summary>
[Collection(FshCollectionDefinition.Name)]
public sealed class InventoryIntegrityPostgresTests
{
    private readonly FshWebApplicationFactory _factory;

    public InventoryIntegrityPostgresTests(FshWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Sale_Deduction_Should_Skip_Expired_Lot_On_Postgres()
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);
        var db = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();

        var branchId = Guid.CreateVersion7();
        var medicine = await SeedMedicineAsync(db, branchId, ("OLD", -1, 10m), ("NEW", 120, 10m));

        await using var transaction = await db.Database.BeginTransactionAsync();
        var results = await new StockDeductionService(db, new FixedBranch(branchId)).DeductForSaleAsync(
            new StockDeductionRequest("Sale", Guid.CreateVersion7(), [new StockDeductionLine(medicine.Id, 4m)]));
        await transaction.CommitAsync();

        results.ShouldHaveSingleItem().Batches.ShouldHaveSingleItem().BatchNo.ShouldBe("NEW");
        var lots = await db.MedicineBatches.AsNoTracking().Where(b => b.MedicineId == medicine.Id).ToListAsync();
        lots.Single(b => b.BatchNo == "OLD").QuantityOnHand.ShouldBe(10m);
        lots.Single(b => b.BatchNo == "NEW").QuantityOnHand.ShouldBe(6m);
    }

    [Fact]
    public async Task Medicine_Search_Should_Filter_Sort_And_Count_Sellable_Stock_In_Sql()
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);
        var db = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();

        var branchId = Guid.CreateVersion7();
        string prefix = $"Q{Guid.CreateVersion7():N}"[..12];
        var onlyExpired = await SeedMedicineAsync(db, branchId, ("X1", -5, 50m), name: $"{prefix} A");
        await SeedMedicineAsync(db, branchId, ("S1", 60, 50m), name: $"{prefix} B");

        var handler = new SearchMedicinesQueryHandler(db, TimeProvider.System, new FixedBranch(branchId));
        var outOfStock = await handler.Handle(
            new SearchMedicinesQuery(Search: prefix, StockStatuses: ["out"], SortBy: "quantity", BranchId: branchId), CancellationToken.None);
        var expiredSorted = await handler.Handle(
            new SearchMedicinesQuery(Search: prefix, ExpiryStatuses: ["expired"], SortBy: "expiry", SortOrder: "desc", BranchId: branchId),
            CancellationToken.None);

        outOfStock.TotalCount.ShouldBe(1);
        var row = outOfStock.Items.ShouldHaveSingleItem();
        row.Id.ShouldBe(onlyExpired.Id);
        row.SellableQuantityOnHand.ShouldBe(0m);
        row.TotalQuantityOnHand.ShouldBe(50m);
        expiredSorted.Items.ShouldHaveSingleItem().Id.ShouldBe(onlyExpired.Id);
    }

    [Fact]
    public async Task Reorder_Suggestions_Should_Ignore_Expired_Stock_On_Postgres()
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);
        var db = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();

        var branchId = Guid.CreateVersion7();
        var medicine = await SeedMedicineAsync(db, branchId, ("X1", -5, 500m), ("S1", 60, 1m));

        var suggestions = await new GetReorderSuggestionsQueryHandler(db, new FixedBranch(branchId))
            .Handle(new GetReorderSuggestionsQuery(branchId), CancellationToken.None);

        suggestions.Single(s => s.MedicineId == medicine.Id).TotalQuantityOnHand.ShouldBe(1m);
    }

    [Fact]
    public async Task Restock_Should_Lock_And_Restore_Original_Lot_In_Its_Own_Transaction()
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);
        var db = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();

        var branchId = Guid.CreateVersion7();
        var medicine = await SeedMedicineAsync(db, branchId, ("L1", 90, 10m));
        var saleId = Guid.CreateVersion7();
        var sut = new StockDeductionService(db, new FixedBranch(branchId));

        await using (var transaction = await db.Database.BeginTransactionAsync())
        {
            await sut.DeductForSaleAsync(new StockDeductionRequest("Sale", saleId, [new StockDeductionLine(medicine.Id, 7m)]));
            await transaction.CommitAsync();
        }

        await sut.RestockAsync(new StockRestockRequest(
            "Sale", saleId, "Sale", saleId, branchId, [new StockRestockLine(medicine.Id, 7m, 1m)]));

        var lot = await db.MedicineBatches.AsNoTracking().SingleAsync(b => b.MedicineId == medicine.Id);
        lot.QuantityOnHand.ShouldBe(10m);
    }

    [Fact]
    public async Task Price_Schedule_Job_Should_Apply_Due_Change_Across_Tenants_On_Postgres()
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);
        var db = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();

        var medicine = await SeedMedicineAsync(db, Guid.CreateVersion7(), ("L1", 90, 10m));
        var schedule = MedicinePriceHistory.CreateScheduled(medicine.Id, 42m, null, NepalClock.Today(), "due today");
        db.MedicinePriceHistories.Add(schedule);
        await db.SaveChangesAsync();

        // The job runs with no tenant context, the way Hangfire runs it.
        using var jobScope = _factory.Services.CreateScope();
        await new ApplyDueMedicinePriceSchedulesJob(
                jobScope.ServiceProvider.GetRequiredService<InventoryDbContext>(),
                NullLogger<ApplyDueMedicinePriceSchedulesJob>.Instance)
            .RunAsync(CancellationToken.None);

        db.ChangeTracker.Clear();
        (await db.Medicines.SingleAsync(m => m.Id == medicine.Id)).UnitPrice.ShouldBe(42m);
        (await db.MedicineBatches.SingleAsync(b => b.MedicineId == medicine.Id)).SellingPrice.ShouldBe(42m);
        (await db.MedicinePriceHistories.SingleAsync(h => h.Id == schedule.Id)).Status.ShouldBe(MedicinePriceHistoryStatus.Active);
    }

    private static async Task<Medicine> SeedMedicineAsync(
        InventoryDbContext db, Guid branchId, params (string BatchNo, int ExpiryInDays, decimal Quantity)[] lots) =>
        await SeedMedicineAsync(db, branchId, lots, name: null);

    private static async Task<Medicine> SeedMedicineAsync(
        InventoryDbContext db, Guid branchId, (string BatchNo, int ExpiryInDays, decimal Quantity) lot, string name) =>
        await SeedMedicineAsync(db, branchId, [lot], name);

    private static async Task<Medicine> SeedMedicineAsync(
        InventoryDbContext db, Guid branchId, (string BatchNo, int ExpiryInDays, decimal Quantity)[] lots, string? name)
    {
        var medicine = Medicine.Create(name ?? $"Med {Guid.CreateVersion7():N}"[..20], null, null, 5m, false, unitPrice: 10m, costPrice: 1m);
        db.Medicines.Add(medicine);
        var today = NepalClock.Today();
        foreach (var (batchNo, expiryInDays, quantity) in lots)
        {
            db.MedicineBatches.Add(MedicineBatch.Create(medicine.Id, branchId, batchNo, today.AddDays(expiryInDays), quantity, 1m, 10m, null));
        }

        await db.SaveChangesAsync();
        return medicine;
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
