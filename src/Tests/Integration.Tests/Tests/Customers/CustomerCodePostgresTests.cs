using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.Services;
using Integration.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace Integration.Tests.Tests.Customers;

/// <summary>
/// Customer numbers against real PostgreSQL: the tenant-wide counter in customers.NumberSequences
/// hands out distinct, increasing C-nnnnnn codes, and the unique (Code, TenantId) index holds.
/// </summary>
[Collection(FshCollectionDefinition.Name)]
public sealed class CustomerCodePostgresTests
{
    private readonly FshWebApplicationFactory _factory;

    public CustomerCodePostgresTests(FshWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Codes_Should_Be_Distinct_And_Increasing()
    {
        using var scope = _factory.Services.CreateScope();
        var tenant = await scope.ServiceProvider.GetRequiredService<IMultiTenantStore<AppTenantInfo>>()
            .GetAsync(TestConstants.RootTenantId);
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant!);
        var codes = scope.ServiceProvider.GetRequiredService<ICustomerCodeService>();

        string first = await codes.NextAsync();
        string second = await codes.NextAsync();

        first.ShouldStartWith(CustomerCodeService.Prefix);
        int a = int.Parse(first[CustomerCodeService.Prefix.Length..], System.Globalization.CultureInfo.InvariantCulture);
        int b = int.Parse(second[CustomerCodeService.Prefix.Length..], System.Globalization.CultureInfo.InvariantCulture);
        b.ShouldBe(a + 1);
    }

    [Fact]
    public async Task Unique_Code_Index_Should_Reject_A_Reused_Code()
    {
        using var scope = _factory.Services.CreateScope();
        var tenant = await scope.ServiceProvider.GetRequiredService<IMultiTenantStore<AppTenantInfo>>()
            .GetAsync(TestConstants.RootTenantId);
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant!);
        var db = scope.ServiceProvider.GetRequiredService<CustomersDbContext>();

        string code = $"C-T{Guid.CreateVersion7():N}"[..12].ToUpperInvariant();
        db.Customers.Add(Customer.Create("First", null, null, null, 0m, code));
        await db.SaveChangesAsync();

        db.Customers.Add(Customer.Create("Second", null, null, null, 0m, code));
        await Should.ThrowAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task Created_Customer_Should_Be_Found_By_Its_Code()
    {
        using var scope = _factory.Services.CreateScope();
        var tenant = await scope.ServiceProvider.GetRequiredService<IMultiTenantStore<AppTenantInfo>>()
            .GetAsync(TestConstants.RootTenantId);
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant!);
        var mediator = scope.ServiceProvider.GetRequiredService<Mediator.IMediator>();

        var id = await mediator.Send(new CreateCustomerCommand("Card Holder", CreditLimit: 1500m));
        var created = await mediator.Send(new GetCustomerByIdQuery(id));
        var found = await mediator.Send(new GetCustomerByCodeQuery($" {created.Code} "));

        found.Id.ShouldBe(id);
        found.CreditLimit.ShouldBe(1500m);
    }
}
