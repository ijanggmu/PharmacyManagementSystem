using FSH.Modules.Auditing.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

namespace FSH.Modules.Auditing.Persistence;

/// <summary>
/// Attaches <see cref="BulkMutationAuditInterceptor"/> to every DbContext in the application, without touching
/// <c>AddHeroDbContext</c> (BuildingBlocks). EF Core applies each <c>IDbContextOptionsConfiguration&lt;TContext&gt;</c>
/// registered in the application service provider. <c>AuditingModule</c> registers this as an open generic, so the
/// hook covers every context, including ones added by modules that do not know about auditing.
/// </summary>
public sealed class BulkMutationAuditOptionsConfiguration<TContext> : IDbContextOptionsConfiguration<TContext>
    where TContext : DbContext
{
    public void Configure(IServiceProvider serviceProvider, DbContextOptionsBuilder optionsBuilder)
    {
        ArgumentNullException.ThrowIfNull(serviceProvider);
        ArgumentNullException.ThrowIfNull(optionsBuilder);

        optionsBuilder.AddInterceptors(new BulkMutationAuditInterceptor(
            serviceProvider.GetRequiredService<IAuditPublisher>(),
            serviceProvider.GetRequiredService<TimeProvider>()));
    }
}
