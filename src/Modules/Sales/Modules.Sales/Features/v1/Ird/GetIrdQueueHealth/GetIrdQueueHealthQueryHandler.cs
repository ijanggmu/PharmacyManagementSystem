using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.Ird;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Ird.GetIrdQueueHealth;

/// <summary>
/// .NET port of the Next.js reference's <c>getSystemHealthForTenant</c> IRD section
/// (system-diagnostics-service.ts). See <see cref="IrdQueueHealthDto"/> remarks for the deliberate
/// deviation from upstream's 50-row-capped pending/failed counts.
/// </summary>
public sealed class GetIrdQueueHealthQueryHandler(SalesDbContext dbContext)
    : IQueryHandler<GetIrdQueueHealthQuery, IrdQueueHealthDto>
{
    private const int RecentFailedTake = 5;

    public async ValueTask<IrdQueueHealthDto> Handle(GetIrdQueueHealthQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        int pendingCount = await dbContext.IrdInvoiceQueues.AsNoTracking()
            .CountAsync(q => q.Status == IrdQueueStatus.Pending, cancellationToken)
            .ConfigureAwait(false);

        int failedCount = await dbContext.IrdInvoiceQueues.AsNoTracking()
            .CountAsync(q => q.Status == IrdQueueStatus.Failed, cancellationToken)
            .ConfigureAwait(false);

        var recentFailed = await dbContext.IrdInvoiceQueues.AsNoTracking()
            .Where(q => q.Status == IrdQueueStatus.Failed)
            .OrderByDescending(q => q.CreatedAtUtc)
            .Take(RecentFailedTake)
            .Select(q => new IrdFailedQueueItemDto(q.Id, q.LastError, q.CreatedAtUtc))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        int salesFailedCount = await dbContext.Sales.AsNoTracking()
            .CountAsync(s => s.IrdStatus == IrdSyncStatus.Failed, cancellationToken)
            .ConfigureAwait(false);

        return new IrdQueueHealthDto(pendingCount, failedCount, salesFailedCount, recentFailed);
    }
}
