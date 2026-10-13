using FSH.Framework.Persistence;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Ird.GetIrdQueue;

/// <summary>Tenant-scoped (Finbuckle) page of IRD dispatch queue rows, newest first. The payload is not returned.</summary>
public sealed class GetIrdQueueQueryHandler(SalesDbContext dbContext)
    : IQueryHandler<GetIrdQueueQuery, PagedResponse<IrdQueueItemDto>>
{
    public async ValueTask<PagedResponse<IrdQueueItemDto>> Handle(GetIrdQueueQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        IQueryable<IrdInvoiceQueueEntry> rows = dbContext.IrdInvoiceQueues.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(query.Status)
            && Enum.TryParse<IrdQueueStatus>(query.Status.Trim(), ignoreCase: true, out var status))
        {
            rows = rows.Where(q => q.Status == status);
        }

        if (!string.IsNullOrWhiteSpace(query.DocumentType)
            && Enum.TryParse<IrdDocumentType>(query.DocumentType.Trim(), ignoreCase: true, out var documentType))
        {
            rows = rows.Where(q => q.DocumentType == documentType);
        }

        if (query.SaleId.HasValue)
        {
            rows = rows.Where(q => q.SaleId == query.SaleId.Value);
        }

        if (query.FromUtc.HasValue)
        {
            rows = rows.Where(q => q.CreatedAtUtc >= query.FromUtc.Value);
        }

        if (query.ToUtc.HasValue)
        {
            rows = rows.Where(q => q.CreatedAtUtc <= query.ToUtc.Value);
        }

        var page = await rows
            .OrderByDescending(q => q.CreatedAtUtc)
            .Select(q => new IrdQueueItemDto
            {
                Id = q.Id,
                SaleId = q.SaleId,
                Status = q.Status.ToString(),
                Attempts = q.Attempts,
                LastError = q.LastError,
                NextAttemptAtUtc = q.NextAttemptAtUtc,
                CreatedAtUtc = q.CreatedAtUtc,
                UpdatedAtUtc = q.UpdatedAtUtc,
                DocumentType = q.DocumentType.ToString(),
                DocumentNumber = q.DocumentNumber,
                ResponseCode = q.ResponseCode,
                LastAttemptAtUtc = q.LastAttemptAtUtc,
                SentAtUtc = q.SentAtUtc,
                IsRealtime = q.IsRealtime,
            })
            .ToPagedResponseAsync(query, cancellationToken)
            .ConfigureAwait(false);

        return page;
    }
}
