using FSH.Framework.Core.Domain;

namespace FSH.Modules.Sales.Domain;

public enum FonepayQrStatus
{
    Pending = 0,
    Success = 1,
    Failed = 2,
}

/// <summary>
/// One dynamic QR requested from Fonepay. Kept so the POS can poll its status by PRN, so a paid QR can't be
/// re-marked pending, and as an audit trail of what was asked of the gateway.
/// </summary>
public sealed class FonepayQrRequest : AggregateRoot<Guid>
{
    /// <summary>Product reference number: our unique id for the request, sent to Fonepay.</summary>
    public string Prn { get; private set; } = default!;
    public decimal Amount { get; private set; }
    public string Environment { get; private set; } = default!;
    public FonepayQrStatus Status { get; private set; }
    public string? TraceId { get; private set; }
    public string? Message { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? CompletedAtUtc { get; private set; }
    public DateTime? LastCheckedAtUtc { get; private set; }

    private FonepayQrRequest() { }

    public static FonepayQrRequest Create(string prn, decimal amount, string environment)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(prn);
        ArgumentException.ThrowIfNullOrWhiteSpace(environment);
        return new FonepayQrRequest
        {
            Id = Guid.CreateVersion7(),
            Prn = prn,
            Amount = amount,
            Environment = environment,
            Status = FonepayQrStatus.Pending,
            CreatedAtUtc = DateTime.UtcNow,
        };
    }

    /// <summary>Records a status check. Success and failure are final; later checks cannot undo them.</summary>
    public void RecordCheck(FonepayQrStatus status, string? traceId, string? message)
    {
        LastCheckedAtUtc = DateTime.UtcNow;
        if (Status != FonepayQrStatus.Pending)
        {
            return;
        }

        Status = status;
        Message = message is { Length: > 500 } ? message[..500] : message;
        if (!string.IsNullOrWhiteSpace(traceId))
        {
            TraceId = traceId;
        }

        if (status != FonepayQrStatus.Pending)
        {
            CompletedAtUtc = DateTime.UtcNow;
        }
    }
}
