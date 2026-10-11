using FSH.Modules.Auditing.Contracts;
using FSH.Modules.Auditing.Persistence;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;
using Xunit;

namespace Auditing.Tests.Persistence;

/// <summary>
/// End-to-end checks for <see cref="BulkMutationAuditInterceptor"/>, wired the same way AuditingModule wires it
/// (open-generic <c>IDbContextOptionsConfiguration&lt;&gt;</c> on a plain <c>AddDbContext</c>). Runs on SQLite, which
/// emits real <c>UPDATE</c>/<c>DELETE</c> statements for ExecuteUpdate/ExecuteDelete.
/// </summary>
public sealed class BulkMutationAuditTests : IDisposable
{
    private readonly SqliteConnection _connection = new("Data Source=:memory:");
    private readonly RecordingAuditPublisher _publisher = new();
    private readonly ServiceProvider _provider;

    public BulkMutationAuditTests()
    {
        _connection.Open();

        var services = new ServiceCollection();
        services.AddSingleton<IAuditPublisher>(_publisher);
        services.AddSingleton(TimeProvider.System);
        services.AddSingleton(typeof(IDbContextOptionsConfiguration<>), typeof(BulkMutationAuditOptionsConfiguration<>));
        services.AddDbContext<BulkTestDbContext>(options => options.UseSqlite(_connection));
        _provider = services.BuildServiceProvider();

        using var scope = _provider.CreateScope();
        scope.ServiceProvider.GetRequiredService<BulkTestDbContext>().Database.EnsureCreated();
    }

    [Fact]
    public async Task ExecuteUpdateAsync_Should_Publish_BulkUpdate_EntityChange_With_RowCount()
    {
        // Arrange
        using var scope = _provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BulkTestDbContext>();
        db.Items.AddRange(new BulkTestItem { Name = "a" }, new BulkTestItem { Name = "b" });
        await db.SaveChangesAsync(CancellationToken.None);
        _publisher.Events.Clear();

        // Act
        int affected = await db.Items.ExecuteUpdateAsync(s => s.SetProperty(i => i.Name, "changed"), CancellationToken.None);

        // Assert
        affected.ShouldBe(2);
        var payload = _publisher.SingleEntityChange();
        payload.Operation.ShouldBe(EntityOperation.BulkUpdate);
        payload.Table.ShouldBe("BulkItems");
        payload.DbContext.ShouldBe(nameof(BulkTestDbContext));
        payload.Key.ShouldBe("rowsAffected:2");
        payload.Changes.ShouldBeEmpty();
    }

    [Fact]
    public async Task ExecuteDeleteAsync_Should_Publish_BulkDelete_EntityChange()
    {
        // Arrange
        using var scope = _provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BulkTestDbContext>();
        db.Items.Add(new BulkTestItem { Name = "gone" });
        await db.SaveChangesAsync(CancellationToken.None);
        _publisher.Events.Clear();

        // Act
        int affected = await db.Items.Where(i => i.Name == "gone").ExecuteDeleteAsync(CancellationToken.None);

        // Assert
        affected.ShouldBe(1);
        var payload = _publisher.SingleEntityChange();
        payload.Operation.ShouldBe(EntityOperation.BulkDelete);
        payload.Table.ShouldBe("BulkItems");
        payload.Key.ShouldBe("rowsAffected:1");
    }

    [Fact]
    public async Task SaveChangesAsync_Should_Not_Publish_Bulk_Event_When_Tracked_Row_Is_Updated()
    {
        // Arrange — a tracked update goes through SaveChanges and is already covered by AuditingSaveChangesInterceptor.
        using var scope = _provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BulkTestDbContext>();
        var item = new BulkTestItem { Name = "before" };
        db.Items.Add(item);
        await db.SaveChangesAsync(CancellationToken.None);
        _publisher.Events.Clear();

        // Act
        item.Name = "after";
        await db.SaveChangesAsync(CancellationToken.None);

        // Assert
        _publisher.Events.ShouldBeEmpty();
    }

    [Fact]
    public async Task ExecuteUpdateAsync_Should_Record_Zero_RowCount_When_No_Rows_Match()
    {
        // Arrange
        using var scope = _provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BulkTestDbContext>();
        _publisher.Events.Clear();

        // Act
        int affected = await db.Items.Where(i => i.Name == "missing")
            .ExecuteUpdateAsync(s => s.SetProperty(i => i.Name, "x"), CancellationToken.None);

        // Assert — the statement still ran, so it is still recorded with rowsAffected:0.
        affected.ShouldBe(0);
        _publisher.SingleEntityChange().Key.ShouldBe("rowsAffected:0");
    }

    public void Dispose()
    {
        _provider.Dispose();
        _connection.Dispose();
    }

    private sealed class RecordingAuditPublisher : IAuditPublisher
    {
        public List<IAuditEvent> Events { get; } = [];

        public IAuditScope CurrentScope => null!;

        public ValueTask PublishAsync(IAuditEvent auditEvent, CancellationToken ct = default)
        {
            Events.Add(auditEvent);
            return ValueTask.CompletedTask;
        }

        public EntityChangeEventPayload SingleEntityChange()
        {
            var envelope = Events.Single(e => e is AuditEnvelope { EventType: AuditEventType.EntityChange });
            return (EntityChangeEventPayload)((AuditEnvelope)envelope).Payload;
        }
    }

    public sealed class BulkTestDbContext(DbContextOptions<BulkTestDbContext> options) : DbContext(options)
    {
        public DbSet<BulkTestItem> Items => Set<BulkTestItem>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            ArgumentNullException.ThrowIfNull(modelBuilder);
            modelBuilder.Entity<BulkTestItem>(b =>
            {
                b.ToTable("BulkItems");
                b.HasKey(x => x.Id);
            });
        }
    }

    public sealed class BulkTestItem
    {
        public int Id { get; set; }

        public string Name { get; set; } = string.Empty;
    }
}
