using FSH.Framework.Shared.Persistence;
using Mediator;

namespace FSH.Modules.Sales.Features.v1.Ird.GetIrdQueue;

/// <summary>
/// Paged list of IRD (CBMS) e-invoice dispatch queue rows for the system "Integrations" log.
/// Module-internal (only this module's endpoint sends it), so it lives beside its handler.
/// </summary>
public sealed class GetIrdQueueQuery : IPagedQuery, IQuery<PagedResponse<IrdQueueItemDto>>
{
    public int? PageNumber { get; set; }

    public int? PageSize { get; set; }

    public string? Sort { get; set; }

    /// <summary>Pending, Processing, Sent or Failed.</summary>
    public string? Status { get; set; }

    public Guid? SaleId { get; set; }

    /// <summary>Bill or Return.</summary>
    public string? DocumentType { get; set; }

    public DateTime? FromUtc { get; set; }

    public DateTime? ToUtc { get; set; }
}

public sealed class IrdQueueItemDto
{
    public Guid Id { get; set; }

    public Guid SaleId { get; set; }

    public string Status { get; set; } = default!;

    public int Attempts { get; set; }

    public string? LastError { get; set; }

    public DateTime? NextAttemptAtUtc { get; set; }

    public DateTime CreatedAtUtc { get; set; }

    public DateTime UpdatedAtUtc { get; set; }

    /// <summary>"Bill" (CBMS /api/bill) or "Return" (credit note, /api/billreturn).</summary>
    public string DocumentType { get; set; } = default!;

    /// <summary>Invoice or credit-note number.</summary>
    public string? DocumentNumber { get; set; }

    /// <summary>What CBMS answered on the last attempt (e.g. "200", "101", "100").</summary>
    public string? ResponseCode { get; set; }

    public DateTime? LastAttemptAtUtc { get; set; }

    public DateTime? SentAtUtc { get; set; }

    public bool? IsRealtime { get; set; }
}
