using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Contracts.v1.Loyalty;
using Integration.Tests.Infrastructure;
using Mediator;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace Integration.Tests.Tests.Customers;

/// <summary>Loyalty against real PostgreSQL: membership, the points ledger and the settings-backed valuation.</summary>
[Collection(FshCollectionDefinition.Name)]
public sealed class LoyaltyPostgresTests
{
    private readonly FshWebApplicationFactory _factory;

    public LoyaltyPostgresTests(FshWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Member_Points_Should_Be_Adjusted_And_Listed()
    {
        using var scope = _factory.Services.CreateScope();
        var tenant = await scope.ServiceProvider.GetRequiredService<IMultiTenantStore<AppTenantInfo>>()
            .GetAsync(TestConstants.RootTenantId);
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant!);
        var mediator = scope.ServiceProvider.GetRequiredService<IMediator>();

        var id = await mediator.Send(new CreateCustomerCommand("Loyal Member", IsMember: true));
        (await mediator.Send(new AdjustLoyaltyPointsCommand(id, 120, "Welcome bonus"))).ShouldBe(120);
        // Removing more than held is refused (never silently clamped); removing all of it is recorded as asked.
        var refused = await Should.ThrowAsync<CustomException>(() => mediator.Send(new AdjustLoyaltyPointsCommand(id, -500, "Correction")).AsTask());
        refused.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
        (await mediator.Send(new AdjustLoyaltyPointsCommand(id, -120, "Correction"))).ShouldBe(0);

        var loyalty = await mediator.Send(new GetCustomerLoyaltyQuery(id));
        loyalty.IsMember.ShouldBeTrue();
        loyalty.MemberSinceUtc.ShouldNotBeNull();
        loyalty.Points.ShouldBe(0);
        loyalty.Entries.Select(e => e.Points).ShouldBe([-120, 120]);
        (await mediator.Send(new GetCustomerByIdQuery(id))).IsMember.ShouldBeTrue();
    }
}
