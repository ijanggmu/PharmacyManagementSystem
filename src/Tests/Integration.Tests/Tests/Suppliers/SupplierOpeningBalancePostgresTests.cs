using System.Net;
using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Persistence;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Purchasing.Contracts.Events;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.IntegrationEventHandlers;
using Integration.Tests.Infrastructure;
using Mediator;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace Integration.Tests.Tests.Suppliers;

/// <summary>Supplier opening balances and deletes against real PostgreSQL.</summary>
[Collection(FshCollectionDefinition.Name)]
public sealed class SupplierOpeningBalancePostgresTests
{
    private readonly FshWebApplicationFactory _factory;

    public SupplierOpeningBalancePostgresTests(FshWebApplicationFactory factory)
    {
        _factory = factory;
    }

    // The tenant context is AsyncLocal: it must be set in the test method itself, not inside an awaited helper.
    private static void SetTenant(IServiceScope scope, AppTenantInfo tenant) =>
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>().MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

    private static Task<AppTenantInfo?> RootTenantAsync(IServiceScope scope) =>
        scope.ServiceProvider.GetRequiredService<IMultiTenantStore<AppTenantInfo>>().GetAsync(TestConstants.RootTenantId);

    [Fact]
    public async Task An_Opening_Balance_Without_The_Permission_Should_Be_Refused_And_Leave_Nothing()
    {
        using var scope = _factory.Services.CreateScope();
        SetTenant(scope, (await RootTenantAsync(scope))!);
        var mediator = scope.ServiceProvider.GetRequiredService<IMediator>();
        string name = $"OB {Guid.CreateVersion7():N}"[..20];

        // No signed-in user in this scope, so no Manage Supplier Opening Balances permission.
        var ex = await Should.ThrowAsync<CustomException>(
            () => mediator.Send(new CreateSupplierCommand(name, OpeningBalance: 500m)).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        var suppliers = scope.ServiceProvider.GetRequiredService<SuppliersDbContext>();
        (await suppliers.Suppliers.AsNoTracking().AnyAsync(s => s.Name == name)).ShouldBeFalse();
    }

    [Fact]
    public async Task A_Receipt_Posted_After_The_Supplier_Was_Deleted_Should_Still_Reach_Its_Ledger()
    {
        using var scope = _factory.Services.CreateScope();
        SetTenant(scope, (await RootTenantAsync(scope))!);
        var mediator = scope.ServiceProvider.GetRequiredService<IMediator>();
        var supplierId = await mediator.Send(new CreateSupplierCommand($"Del {Guid.CreateVersion7():N}"[..20]));
        await mediator.Send(new DeleteSupplierCommand(supplierId));

        var handler = ActivatorUtilities.CreateInstance<PurchaseOrderReceivedIntegrationEventHandler>(scope.ServiceProvider);
        await handler.HandleAsync(new PurchaseOrderReceivedIntegrationEvent(
            Guid.CreateVersion7(), DateTime.UtcNow, TestConstants.RootTenantId, "corr", "Purchasing",
            PurchaseOrderId: Guid.CreateVersion7(), SupplierId: supplierId, TotalAmount: 250m, OrderDateUtc: DateTime.UtcNow));

        var suppliers = scope.ServiceProvider.GetRequiredService<SuppliersDbContext>();
        var supplier = await suppliers.Suppliers.IgnoreQueryFilters([QueryFilters.SoftDelete]).AsNoTracking()
            .SingleAsync(s => s.Id == supplierId);
        supplier.CurrentBalance.ShouldBe(250m);
        (await suppliers.SupplierLedgerEntries.AsNoTracking().CountAsync(e => e.SupplierId == supplierId)).ShouldBe(1);
    }
}
