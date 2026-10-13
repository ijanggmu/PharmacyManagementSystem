using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Notifications.Contracts.v1.Sms;
using FSH.Modules.Notifications.Data;
using FSH.Modules.Notifications.Domain;
using FSH.Modules.Notifications.Jobs;
using FSH.Modules.Notifications.Sms;
using FSH.Modules.Notifications.Sms.Providers;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NSubstitute;

namespace Notifications.Tests.Sms;

/// <summary>The SMS queue: quiet hours (receipts exempt), the per-tenant hourly rate limit, retries and the off switch.</summary>
public sealed class ProcessSmsQueueJobTests
{
    private const string Tenant = "test-tenant";

    // 16:00 UTC = 21:45 Nepal time: inside the default quiet hours.
    private static readonly DateTime Evening = new(2026, 10, 13, 16, 0, 0, DateTimeKind.Utc);

    // 06:00 UTC = 11:45 Nepal time.
    private static readonly DateTime Midday = new(2026, 10, 13, 6, 0, 0, DateTimeKind.Utc);

    private readonly string _database = Guid.NewGuid().ToString();
    private readonly FakeProvider _provider = new();

    [Fact]
    public async Task Quiet_Hours_Hold_Reminders_But_Not_Receipts()
    {
        await SeedAsync(s => { }, Message(SmsKinds.DuesReminder, Evening), Message(SmsKinds.Receipt, Evening));

        await RunAsync(Evening);

        await using var db = CreateDb();
        var reminder = await db.SmsMessages.SingleAsync(m => m.Kind == SmsKinds.DuesReminder);
        var receipt = await db.SmsMessages.SingleAsync(m => m.Kind == SmsKinds.Receipt);
        receipt.Status.ShouldBe(SmsStatus.Sent);
        reminder.Status.ShouldBe(SmsStatus.Queued);
        reminder.Attempts.ShouldBe(0);
        reminder.NextAttemptAtUtc.ShouldBe(new DateTime(2026, 10, 14, 1, 15, 0, DateTimeKind.Utc)); // 07:00 NPT
        _provider.Sent.Count.ShouldBe(1);
    }

    [Fact]
    public async Task Rate_Limit_Leaves_The_Rest_Queued()
    {
        await SeedAsync(s => s.MaxPerHour = 2,
            Message(SmsKinds.DuesReminder, Midday), Message(SmsKinds.DuesReminder, Midday), Message(SmsKinds.DuesReminder, Midday));

        await RunAsync(Midday);

        await using var db = CreateDb();
        (await db.SmsMessages.CountAsync(m => m.Status == SmsStatus.Sent)).ShouldBe(2);
        (await db.SmsMessages.CountAsync(m => m.Status == SmsStatus.Queued)).ShouldBe(1);
    }

    [Fact]
    public async Task Transient_Failure_Is_Retried_With_Backoff()
    {
        _provider.Next = SmsSendResult.Transient("timeout");
        await SeedAsync(s => { }, Message(SmsKinds.DuesReminder, Midday));

        await RunAsync(Midday);

        await using var db = CreateDb();
        var message = await db.SmsMessages.SingleAsync();
        message.Status.ShouldBe(SmsStatus.Queued);
        message.Attempts.ShouldBe(1);
        message.NextAttemptAtUtc.ShouldBe(Midday.AddMinutes(1));
        message.LastError.ShouldBe("timeout");
    }

    [Fact]
    public async Task Permanent_Failure_Fails_At_Once()
    {
        _provider.Next = SmsSendResult.Permanent("Invalid Token", "1002");
        await SeedAsync(s => { }, Message(SmsKinds.DuesReminder, Midday));

        await RunAsync(Midday);

        await using var db = CreateDb();
        var message = await db.SmsMessages.SingleAsync();
        message.Status.ShouldBe(SmsStatus.Failed);
        message.ResponseCode.ShouldBe("1002");
    }

    [Fact]
    public async Task Turned_Off_Fails_Reminders_Without_Calling_The_Gateway()
    {
        await SeedAsync(s => s.Enabled = false, Message(SmsKinds.DuesReminder, Midday));

        await RunAsync(Midday);

        await using var db = CreateDb();
        (await db.SmsMessages.SingleAsync()).Status.ShouldBe(SmsStatus.Failed);
        _provider.Sent.ShouldBeEmpty();
    }

    private sealed class SettingsInput
    {
        public bool Enabled { get; set; } = true;
        public int MaxPerHour { get; set; } = 100;
    }

    private static SmsMessage Message(string kind, DateTime now) =>
        SmsMessage.Queue(kind, SmsTrigger.Automatic, Guid.NewGuid(), "Ram", "9841234567", "Hello", SmsLanguages.English,
            SmsProviderNames.LogOnly, null, ignoresQuietHours: kind == SmsKinds.Receipt, null, now.AddMinutes(-5));

    private async Task SeedAsync(Action<SettingsInput> configure, params SmsMessage[] messages)
    {
        var input = new SettingsInput();
        configure(input);
        var settings = SmsSettings.CreateDefault();
        settings.Update(input.Enabled, SmsProviderNames.LogOnly, null, null, "City Pharmacy", SmsLanguages.English,
            true, true, 7, true, 3, 21, 7, input.MaxPerHour);

        await using var db = CreateDb();
        db.SmsSettings.Add(settings);
        db.SmsMessages.AddRange(messages);
        await db.SaveChangesAsync();
    }

    private async Task RunAsync(DateTime now)
    {
        var services = new ServiceCollection();
        services.AddScoped(_ => CreateDb());
        await using var provider = services.BuildServiceProvider();

        var tenantScope = Substitute.For<IEventTenantScope>();
        tenantScope.Begin(Arg.Any<string?>()).Returns(Substitute.For<IDisposable>());

        await using var db = CreateDb();
        var job = new ProcessSmsQueueJob(
            db,
            provider.GetRequiredService<IServiceScopeFactory>(),
            tenantScope,
            new SmsSecrets(new EphemeralDataProtectionProvider()),
            new SmsProviderResolver([_provider]),
            new FixedTimeProvider(now),
            NullLogger<ProcessSmsQueueJob>.Instance);

        await job.RunForTenantAsync(Tenant, CancellationToken.None);
    }

    private NotificationsDbContext CreateDb()
    {
        var accessor = Substitute.For<IMultiTenantContextAccessor<AppTenantInfo>>();
        accessor.MultiTenantContext.Returns(new MultiTenantContext<AppTenantInfo>(new AppTenantInfo(Tenant, Tenant)));
        var options = new DbContextOptionsBuilder<NotificationsDbContext>().UseInMemoryDatabase(_database).Options;
        var settings = Options.Create(new DatabaseOptions
        {
            Provider = "postgresql",
            ConnectionString = string.Empty,
            MigrationsAssembly = "FSH.Starter.Migrations.PostgreSQL",
        });
        var environment = Substitute.For<IHostEnvironment>();
        environment.EnvironmentName.Returns("Production");
        return new NotificationsDbContext(accessor, options, settings, environment);
    }

    private sealed class FakeProvider : ISmsProvider
    {
        public string Name => SmsProviderNames.LogOnly;
        public List<SmsSendRequest> Sent { get; } = [];
        public SmsSendResult Next { get; set; } = new(true, false, "200", "queued", "id-1", 1m);

        public Task<SmsSendResult> SendAsync(SmsSendRequest request, CancellationToken cancellationToken)
        {
            Sent.Add(request);
            return Task.FromResult(Next);
        }
    }

    private sealed class FixedTimeProvider(DateTime utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(utcNow, TimeSpan.Zero);
    }
}
