using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Reference.Contracts.Licenses;
using FSH.Modules.Reference.Contracts.v1.Licenses;
using FSH.Modules.Reference.Data;
using FSH.Modules.Reference.Jobs;
using Integration.Tests.Infrastructure;
using Mediator;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace Integration.Tests.Tests.Reference;

/// <summary>Licenses against real PostgreSQL: CRUD, days-left listing, and the daily reminder scan.</summary>
[Collection(FshCollectionDefinition.Name)]
public sealed class LicenseExpiryScanPostgresTests
{
    private readonly FshWebApplicationFactory _factory;

    public LicenseExpiryScanPostgresTests(FshWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Scan_Should_Remind_A_License_Expiring_In_Seven_Days_Once()
    {
        using var scope = _factory.Services.CreateScope();
        var tenant = await scope.ServiceProvider.GetRequiredService<IMultiTenantStore<AppTenantInfo>>()
            .GetAsync(TestConstants.RootTenantId);
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant!);
        var mediator = scope.ServiceProvider.GetRequiredService<IMediator>();

        var today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(5).AddMinutes(45));
        string number = $"DDA-{Guid.CreateVersion7():N}"[..16];
        var id = await mediator.Send(new CreatePharmacyLicenseCommand(PharmacyLicenseTypes.DdaPharmacy, number, today.AddDays(7)));

        var listed = (await mediator.Send(new ListPharmacyLicensesQuery())).Single(l => l.Id == id);
        listed.DaysLeft.ShouldBe(7);
        listed.Status.ShouldBe(PharmacyLicenseStatus.Expiring);

        var job = ActivatorUtilities.CreateInstance<LicenseExpiryScanJob>(scope.ServiceProvider);
        await job.RunAsync(CancellationToken.None);
        await job.RunAsync(CancellationToken.None);

        var db = scope.ServiceProvider.GetRequiredService<ReferenceDbContext>();
        (await db.PharmacyLicenses.AsNoTracking().SingleAsync(l => l.Id == id)).LastReminderOn.ShouldBe(today);

        await mediator.Send(new DeletePharmacyLicenseCommand(id));
    }
}
