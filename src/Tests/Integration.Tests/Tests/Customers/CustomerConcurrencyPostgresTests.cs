using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Contracts.v1.Loyalty;
using Integration.Tests.Infrastructure;
using Mediator;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace Integration.Tests.Tests.Customers;

/// <summary>
/// Concurrent writers against one customer row on real PostgreSQL: the row lock (SELECT ... FOR UPDATE) and the
/// xmin concurrency token mean no update is lost and every running balance is distinct and consistent.
/// </summary>
[Collection(FshCollectionDefinition.Name)]
public sealed class CustomerConcurrencyPostgresTests
{
    private readonly FshWebApplicationFactory _factory;

    public CustomerConcurrencyPostgresTests(FshWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Concurrent_Point_Adjustments_Should_Not_Lose_Updates()
    {
        Guid customerId;
        using (var scope = _factory.Services.CreateScope())
        {
            var tenant = await scope.ServiceProvider.GetRequiredService<IMultiTenantStore<AppTenantInfo>>()
                .GetAsync(TestConstants.RootTenantId);
            scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
                .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant!);
            customerId = await scope.ServiceProvider.GetRequiredService<IMediator>()
                .Send(new CreateCustomerCommand("Concurrent Member", IsMember: true));
        }

        const int writers = 8;
        var balances = await Task.WhenAll(Enumerable.Range(0, writers).Select(_ => Task.Run(async () =>
        {
            using var scope = _factory.Services.CreateScope();
            var tenant = await scope.ServiceProvider.GetRequiredService<IMultiTenantStore<AppTenantInfo>>()
                .GetAsync(TestConstants.RootTenantId);
            scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
                .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant!);
            return await scope.ServiceProvider.GetRequiredService<IMediator>()
                .Send(new AdjustLoyaltyPointsCommand(customerId, 10, "Concurrent bonus"));
        })));

        balances.OrderBy(b => b).ShouldBe(Enumerable.Range(1, writers).Select(i => i * 10));

        using (var scope = _factory.Services.CreateScope())
        {
            var tenant = await scope.ServiceProvider.GetRequiredService<IMultiTenantStore<AppTenantInfo>>()
                .GetAsync(TestConstants.RootTenantId);
            scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
                .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant!);
            var loyalty = await scope.ServiceProvider.GetRequiredService<IMediator>()
                .Send(new GetCustomerLoyaltyQuery(customerId));
            loyalty.Points.ShouldBe(writers * 10);
        }
    }
}
