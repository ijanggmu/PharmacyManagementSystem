using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Inventory.Contracts.v1.StockTransfers;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Features.v1.StockTransfers.CancelStockTransfer;
using FSH.Modules.Inventory.Features.v1.StockTransfers.ReceiveStockTransfer;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using FSH.Modules.Purchasing.Features.v1.PurchaseOrders.ReceivePurchaseOrder;
using Integration.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace Integration.Tests.Tests.Inventory;

/// <summary>
/// Races two writers that would each put the same stock on the shelf — receiving a transfer twice,
/// receiving it while it is cancelled, receiving a purchase order twice — against real PostgreSQL, to prove
/// the row lock on the transfer / purchase order makes the second one wait and be refused.
/// </summary>
[Collection(FshCollectionDefinition.Name)]
public sealed class StockIntakeRaceTests
{
    private readonly FshWebApplicationFactory _factory;

    public StockIntakeRaceTests(FshWebApplicationFactory factory)
    {
        _factory = factory;
    }

    private enum Outcome
    {
        Succeeded,
        Rejected,
    }

    [Fact]
    public async Task A_Transfer_Received_Twice_At_Once_Should_Restock_Once()
    {
        var (transferId, medicineId, toBranchId) = await SeedTransferInTransitAsync(quantity: 6m);
        var gate = new StartGate(parties: 2);

        var outcomes = await Task.WhenAll(
            ReceiveTransferAsync(transferId, gate),
            ReceiveTransferAsync(transferId, gate));

        outcomes.Count(o => o == Outcome.Succeeded).ShouldBe(1);
        outcomes.Count(o => o == Outcome.Rejected).ShouldBe(1);
        (await OnHandAsync(toBranchId, medicineId)).ShouldBe(6m);
    }

    [Fact]
    public async Task A_Transfer_Received_And_Cancelled_At_Once_Should_Restock_At_One_Branch_Only()
    {
        var (transferId, medicineId, toBranchId) = await SeedTransferInTransitAsync(quantity: 6m);
        var fromBranchId = await FromBranchAsync(transferId);
        var gate = new StartGate(parties: 2);

        var outcomes = await Task.WhenAll(
            ReceiveTransferAsync(transferId, gate),
            CancelTransferAsync(transferId, gate));

        outcomes.Count(o => o == Outcome.Succeeded).ShouldBe(1);
        outcomes.Count(o => o == Outcome.Rejected).ShouldBe(1);
        // Six units left the source when the transfer was dispatched; they come back to exactly one branch.
        ((await OnHandAsync(toBranchId, medicineId)) + (await OnHandAsync(fromBranchId, medicineId))).ShouldBe(6m);
    }

    [Fact]
    public async Task A_Purchase_Order_Received_Twice_At_Once_Should_Add_Its_Stock_Once()
    {
        var branchId = Guid.CreateVersion7();
        var (orderId, medicineId) = await SeedApprovedPurchaseOrderAsync(branchId, quantity: 5m);
        var gate = new StartGate(parties: 2);

        var outcomes = await Task.WhenAll(
            ReceiveOrderAsync(branchId, orderId, gate),
            ReceiveOrderAsync(branchId, orderId, gate));

        outcomes.Count(o => o == Outcome.Succeeded).ShouldBe(1);
        outcomes.Count(o => o == Outcome.Rejected).ShouldBe(1);
        (await OnHandAsync(branchId, medicineId)).ShouldBe(5m);
    }

    // ---------------------------------------------------------------------------------------------
    // Contenders. Each opens its own scope and installs the tenant INLINE (Finbuckle's context is AsyncLocal).
    // ---------------------------------------------------------------------------------------------

    private async Task<Outcome> ReceiveTransferAsync(Guid transferId, StartGate gate)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var handler = ActivatorUtilities.CreateInstance<ReceiveStockTransferCommandHandler>(scope.ServiceProvider);
        await gate.ArriveAsync();
        return await RunAsync(() => handler.Handle(new ReceiveStockTransferCommand(transferId), CancellationToken.None).AsTask());
    }

    private async Task<Outcome> CancelTransferAsync(Guid transferId, StartGate gate)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var handler = ActivatorUtilities.CreateInstance<CancelStockTransferCommandHandler>(scope.ServiceProvider);
        await gate.ArriveAsync();
        return await RunAsync(() => handler.Handle(new CancelStockTransferCommand(transferId, "Not needed"), CancellationToken.None).AsTask());
    }

    private async Task<Outcome> ReceiveOrderAsync(Guid branchId, Guid orderId, StartGate gate)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var handler = ActivatorUtilities.CreateInstance<ReceivePurchaseOrderCommandHandler>(
            scope.ServiceProvider, new FixedBranch(branchId));
        await gate.ArriveAsync();
        return await RunAsync(() => handler.Handle(new ReceivePurchaseOrderCommand(orderId), CancellationToken.None).AsTask());
    }

    private static async Task<Outcome> RunAsync(Func<Task> work)
    {
        try
        {
            await work();
            return Outcome.Succeeded;
        }
        catch (CustomException ex) when (ex.StatusCode == System.Net.HttpStatusCode.Conflict)
        {
            return Outcome.Rejected;
        }
    }

    // ---------------------------------------------------------------------------------------------
    // Seeding and verification.
    // ---------------------------------------------------------------------------------------------

    private static async Task<Guid> SeedMedicineAsync(InventoryDbContext db)
    {
        var medicine = Medicine.Create(
            name: $"Intake {Guid.CreateVersion7():N}"[..20], genericName: null, categoryId: null,
            reorderLevel: 0m, unitPrice: 10m, costPrice: 5m);
        db.Medicines.Add(medicine);
        await db.SaveChangesAsync();
        return medicine.Id;
    }

    /// <summary>A transfer already dispatched: the units have left the source batch and sit in its allocation.</summary>
    private async Task<(Guid TransferId, Guid MedicineId, Guid ToBranchId)> SeedTransferInTransitAsync(decimal quantity)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var db = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();
        var medicineId = await SeedMedicineAsync(db);
        Guid fromBranchId = Guid.CreateVersion7();
        Guid toBranchId = Guid.CreateVersion7();
        var expiry = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1));
        // A dispatched allocation copies the source lot's stored (normalized) batch number.
        string batchNo = MedicineBatch.NormalizeBatchNo($"TRF-{Guid.CreateVersion7():N}"[..16]);

        var source = MedicineBatch.Create(medicineId, fromBranchId, batchNo, expiry, 0m, 5m, 10m, rackLocation: null);
        db.MedicineBatches.Add(source);
        var transfer = StockTransfer.Create(fromBranchId, toBranchId, Guid.CreateVersion7(), null, [(medicineId, quantity)]);
        db.StockTransfers.Add(transfer);
        db.StockTransferBatches.Add(StockTransferBatch.Create(transfer.Id, medicineId, source.Id, batchNo, expiry, quantity, 5m, 10m));
        await db.SaveChangesAsync();
        return (transfer.Id, medicineId, toBranchId);
    }

    private async Task<Guid> FromBranchAsync(Guid transferId)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var db = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();
        return await db.StockTransfers.AsNoTracking().Where(t => t.Id == transferId).Select(t => t.FromBranchId).SingleAsync();
    }

    private async Task<(Guid OrderId, Guid MedicineId)> SeedApprovedPurchaseOrderAsync(Guid branchId, decimal quantity)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var medicineId = await SeedMedicineAsync(scope.ServiceProvider.GetRequiredService<InventoryDbContext>());
        var db = scope.ServiceProvider.GetRequiredService<PurchasingDbContext>();
        var order = PurchaseOrder.CreateDraft(Guid.CreateVersion7(), DateTime.UtcNow, null, branchId: branchId);
        order.AddLine(medicineId, $"PO-{Guid.CreateVersion7():N}"[..14], DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)),
            quantity, 5m, 10m, rackLocation: null);
        order.Approve("race-test");
        db.PurchaseOrders.Add(order);
        await db.SaveChangesAsync();
        return (order.Id, medicineId);
    }

    private async Task<decimal> OnHandAsync(Guid branchId, Guid medicineId)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var db = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();
        return await db.MedicineBatches.AsNoTracking()
            .Where(b => b.BranchId == branchId && b.MedicineId == medicineId)
            .SumAsync(b => b.QuantityOnHand);
    }

    private async Task<(IServiceScope Scope, AppTenantInfo Tenant)> NewScopeAsync()
    {
        var scope = _factory.Services.CreateScope();
        var tenant = await scope.ServiceProvider
            .GetRequiredService<IMultiTenantStore<AppTenantInfo>>()
            .GetAsync(TestConstants.RootTenantId);
        return (scope, tenant!);
    }

    private sealed class StartGate(int parties)
    {
        private int _arrived;
        private readonly TaskCompletionSource _open = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public Task ArriveAsync()
        {
            if (Interlocked.Increment(ref _arrived) >= parties)
            {
                _open.TrySetResult();
            }

            return _open.Task;
        }
    }

    private sealed class FixedBranch(Guid branchId) : ICurrentBranch
    {
        public Task<Guid?> GetBranchIdAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult<Guid?>(branchId);

        public Task<Guid?> GetListFilterBranchIdAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult<Guid?>(branchId);

        public Task<Guid?> ResolveListBranchFilterAsync(Guid? requestedBranchId, CancellationToken cancellationToken = default) =>
            Task.FromResult<Guid?>(requestedBranchId ?? branchId);

        public Task<bool> CanViewAllBranchesAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(true);

        public Task<Guid> RequireBranchIdAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(branchId);
    }
}
