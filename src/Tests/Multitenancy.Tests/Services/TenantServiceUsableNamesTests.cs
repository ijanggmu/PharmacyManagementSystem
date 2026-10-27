using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Multitenancy;
using FSH.Modules.Multitenancy.Data;
using FSH.Modules.Multitenancy.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NSubstitute;

namespace Multitenancy.Tests.Services;

/// <summary>
/// <see cref="TenantService.GetUsableTenantNamesAsync"/> feeds the public Explore page, so it must only name
/// pharmacies that can be used right now: active, and not past validity plus the grace period. Never root.
/// </summary>
public sealed class TenantServiceUsableNamesTests : IDisposable
{
    private const int GraceDays = 7;
    private static readonly DateTime Now = new(2031, 6, 10, 0, 0, 0, DateTimeKind.Utc);

    private readonly TenantDbContext _db = Features.Branches.TenantDbContextFactory.Create();
    private readonly TimeProvider _clock = Substitute.For<TimeProvider>();
    private readonly TenantService _sut;

    public TenantServiceUsableNamesTests()
    {
        _clock.GetUtcNow().Returns(new DateTimeOffset(Now, TimeSpan.Zero));
        _sut = new TenantService(
            Substitute.For<IMultiTenantStore<AppTenantInfo>>(),
            Options.Create(new DatabaseOptions { ConnectionString = "Host=localhost;Database=fsh;Username=x;Password=y" }),
            serviceProvider: null!,
            _db,
            provisioningService: null!,
            _clock,
            Options.Create(new TenantBillingOptions { GracePeriodDays = GraceDays }),
            NullLogger<TenantService>.Instance);
    }

    public void Dispose() => _db.Dispose();

    private void Add(string id, string name, DateTime validUpto, bool active = true)
    {
        var tenant = new AppTenantInfo(id, name, connectionString: null, adminEmail: $"admin@{id}.test") { ValidUpto = validUpto };
        if (!active)
        {
            tenant.Deactivate();
        }

        _db.TenantInfo.Add(tenant);
        _db.SaveChanges();
    }

    [Fact]
    public async Task Names_only_active_tenants_in_date_or_in_grace()
    {
        Add("valid", "Valid Pharmacy", Now.AddDays(30));
        Add("in-grace", "Grace Pharmacy", Now.AddDays(-GraceDays));
        Add("expired", "Expired Pharmacy", Now.AddDays(-GraceDays - 1));
        Add("stopped", "Stopped Pharmacy", Now.AddDays(30), active: false);
        Add("not-asked", "Other Pharmacy", Now.AddDays(30));

        var names = await _sut.GetUsableTenantNamesAsync(["valid", "in-grace", "expired", "stopped", "missing"]);

        names.ShouldBe(new Dictionary<string, string>
        {
            ["valid"] = "Valid Pharmacy",
            ["in-grace"] = "Grace Pharmacy",
        }, ignoreOrder: true);
    }

    [Fact]
    public async Task Never_names_the_root_tenant()
    {
        Add(MultitenancyConstants.Root.Id, MultitenancyConstants.Root.Name, Now.AddYears(1));

        (await _sut.GetUsableTenantNamesAsync([MultitenancyConstants.Root.Id])).ShouldBeEmpty();
    }

    [Fact]
    public async Task No_ids_reads_nothing()
    {
        (await _sut.GetUsableTenantNamesAsync([])).ShouldBeEmpty();
    }
}
