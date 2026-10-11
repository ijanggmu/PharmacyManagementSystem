using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Onboarding.Domain;

/// <summary>
/// One row per tenant (port of the Next.js migration wizard's <c>migration_sessions</c> table,
/// scripts/99): records the cutover date opening balances are posted as of, and gates the whole
/// opening-balance import behind a Draft -&gt; Committed lifecycle so a pharmacy can build up bank,
/// cash, customer/supplier, and stock figures across several requests before finalizing them.
/// </summary>
public sealed class MigrationSession : AggregateRoot<Guid>
{
    public DateOnly CutoverDate { get; private set; }
    public string? Notes { get; private set; }
    public MigrationSessionStatus Status { get; private set; }
    public string CreatedBy { get; private set; } = default!;
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? CommittedAtUtc { get; private set; }
    public string? CommittedBy { get; private set; }

    public Guid? BankVoucherId { get; private set; }
    public Guid? CashVoucherId { get; private set; }
    public Guid? CustomerVoucherId { get; private set; }
    public Guid? SupplierVoucherId { get; private set; }
    public Guid? StockVoucherId { get; private set; }

    private MigrationSession() { }

    public static MigrationSession Create(DateOnly cutoverDate, string? notes, string createdBy)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(createdBy);

        return new MigrationSession
        {
            Id = Guid.CreateVersion7(),
            CutoverDate = cutoverDate,
            Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim(),
            Status = MigrationSessionStatus.Draft,
            CreatedBy = createdBy.Trim(),
            CreatedAtUtc = DateTime.UtcNow,
        };
    }

    /// <summary>Throws (409) if the session is no longer Draft — called before any category is saved
    /// or before commit does any voucher/stock/ledger work, so a locked session can never be mutated
    /// or double-posted.</summary>
    public void EnsureDraft()
    {
        if (Status != MigrationSessionStatus.Draft)
        {
            throw new CustomException(
                "This migration session is already committed — opening balances are locked.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
    }

    public void Commit(
        string committedBy,
        Guid? bankVoucherId,
        Guid? cashVoucherId,
        Guid? customerVoucherId,
        Guid? supplierVoucherId,
        Guid? stockVoucherId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(committedBy);
        EnsureDraft();

        Status = MigrationSessionStatus.Committed;
        CommittedAtUtc = DateTime.UtcNow;
        CommittedBy = committedBy.Trim();
        BankVoucherId = bankVoucherId;
        CashVoucherId = cashVoucherId;
        CustomerVoucherId = customerVoucherId;
        SupplierVoucherId = supplierVoucherId;
        StockVoucherId = stockVoucherId;
    }
}
