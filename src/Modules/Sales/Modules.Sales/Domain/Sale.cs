using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Sales.Domain;

public enum SaleStatus
{
    Building = 0,
    Completed = 1,
    Cancelled = 2,
}

/// <summary>
/// Mirrors the Next.js reference's <c>sales.ird_status</c> column (scripts/33-ird-invoices-and-narcotic-
/// register.sql), which defaults every sale to <c>'pending'</c> and only ever moves to <c>'synced'</c>
/// or <c>'failed'</c> once the IRD queue actually attempts dispatch — see
/// <c>FSH.Modules.Sales.Jobs.ProcessIrdInvoiceQueueJob</c>. There is no "not queued" state upstream, so
/// none is added here either.
/// </summary>
public enum IrdSyncStatus
{
    Pending = 0,
    Synced = 1,
    Failed = 2,
}

/// <summary>
/// Thrown when a mutation is attempted on a sale that has been IRD-synced. Mirrors the Next.js
/// <c>prevent_locked_sales_modification</c> trigger (scripts/33-ird-invoices-and-narcotic-register.sql):
/// once synced, changes must go through returns/credit notes instead. Maps to 409 Conflict.
/// </summary>
public sealed class SaleLockedException : CustomException
{
    public SaleLockedException(Guid saleId)
        : base(
            $"Cannot modify IRD-locked sale {saleId}. Use returns/credit notes instead.",
            (IEnumerable<string>?)null,
            HttpStatusCode.Conflict)
    {
    }

    public SaleLockedException() : this(Guid.Empty) { }

    public SaleLockedException(string message)
        : base(message, (IEnumerable<string>?)null, HttpStatusCode.Conflict)
    {
    }

    public SaleLockedException(string message, Exception innerException)
        : base(message, innerException, HttpStatusCode.Conflict)
    {
    }
}

/// <summary>
/// Built (items added), then finalized in one call once stock has been deducted and
/// the caller knows the actual total — mirrors <c>AccountingVoucher</c>'s Draft/Post shape, except
/// a sale has no separate "post later" step: by the time finalization runs, the
/// orchestrating handler has already committed to completing the sale.
/// </summary>
public sealed class Sale : AggregateRoot<Guid>
{
    private readonly List<SaleItem> _items = [];
    private readonly List<SalePayment> _payments = [];

    /// <summary>The branch this sale was transacted at — required (branch-scoping-plan.md §2: a
    /// sale is always attributed to exactly one branch, resolved via
    /// <c>ICurrentBranch.RequireBranchIdAsync</c> in the owning handler, never left unscoped).</summary>
    public Guid BranchId { get; private set; }

    public Guid? CustomerId { get; private set; }
    public DateTime SaleDateUtc { get; private set; }
    public SaleStatus Status { get; private set; } = SaleStatus.Building;
    public string PaymentMethod { get; private set; } = default!;
    public decimal PaymentAmount { get; private set; }
    public Guid? PrescriptionId { get; private set; }
    public string? Notes { get; private set; }

    /// <summary>The authenticated user who created this sale. Null for sales created before this was
    /// recorded, or by a call with no authenticated user.</summary>
    public Guid? CashierUserId { get; private set; }

    /// <summary>The client's request id (the checkout's <c>Idempotency-Key</c>), unique per tenant. A
    /// retried or offline-replayed checkout with the same key resolves to this sale instead of creating a
    /// second one. Null on sales recorded before it was stored, or created without a key.</summary>
    public string? ClientRequestId { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? CancelledAtUtc { get; private set; }
    public string? CancelReason { get; private set; }

    /// <summary>Assigned once, the first time this sale is sent to IRD (<see cref="AssignInvoiceNumberIfMissing"/>) — mirrors <c>sales.invoice_number</c> upstream.</summary>
    public string? InvoiceNumber { get; private set; }
    /// <summary>BS year the sale's fiscal year started in (2083 for FY 2083/84). Null on sales recorded
    /// before sequential invoice numbering.</summary>
    public int? FiscalYear { get; private set; }

    /// <summary>VAT rate applied at sale time. VAT breakdown fields are null on sales recorded before the
    /// breakdown was stored (their VAT was only ever posted to the ledger).</summary>
    public decimal? VatRatePercent { get; private set; }

    /// <summary>Taxable sales value excluding VAT.</summary>
    public decimal? TaxableAmount { get; private set; }

    /// <summary>VAT carved out of the taxable lines (prices are VAT-inclusive).</summary>
    public decimal? VatAmount { get; private set; }

    /// <summary>Total of VAT-exempt lines.</summary>
    public decimal? ExemptAmount { get; private set; }

    public IrdSyncStatus IrdStatus { get; private set; } = IrdSyncStatus.Pending;
    public string? IrdInvoiceId { get; private set; }
    public DateTime? IrdSyncedAtUtc { get; private set; }
    public string? IrdError { get; private set; }

    /// <summary>True once the sale has been IRD-synced. Equivalent to the Next.js trigger's
    /// <c>ird_status = 'synced'</c> condition; the upstream <c>locked_at</c> column has no .NET
    /// counterpart yet, so IRD sync is the only lock source here.</summary>
    public bool IsIrdLocked => IrdStatus == IrdSyncStatus.Synced;

    public IReadOnlyList<SaleItem> Items => _items;

    public IReadOnlyList<SalePayment> Payments => _payments;

    public decimal TotalAmount => _items.Sum(i => i.LineTotal);

    /// <summary>What the customer still owes on this sale (0 for a fully-paid sale), stored at
    /// finalize time. Only ever non-zero when <see cref="CustomerId"/> is set — a credit sale requires
    /// a known customer to carry the AR balance.</summary>
    public decimal BalanceDue { get; private set; }

    /// <summary>Loyalty points the customer spent on this sale; their value is within the line discounts.</summary>
    public int LoyaltyPointsRedeemed { get; private set; }

    /// <summary>Total of the line discounts (manual, member and loyalty).</summary>
    public decimal TotalDiscount => _items.Sum(i => i.DiscountAmount);

    /// <summary>Records points spent on this sale (validated by the caller against the customer's balance).</summary>
    public void RecordLoyaltyRedemption(int points)
    {
        if (points < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(points), points, "Redeemed points cannot be negative.");
        }

        LoyaltyPointsRedeemed = points;
    }

    private Sale() { }

    public static Sale StartBuilding(
        Guid branchId, Guid? customerId, Guid? prescriptionId, string? notes, Guid? cashierUserId = null, string? clientRequestId = null)
    {
        return new Sale
        {
            ClientRequestId = string.IsNullOrWhiteSpace(clientRequestId) ? null : clientRequestId.Trim(),
            Id = Guid.CreateVersion7(),
            BranchId = branchId,
            CustomerId = customerId,
            PrescriptionId = prescriptionId,
            Notes = notes?.Trim(),
            CashierUserId = cashierUserId,
            SaleDateUtc = DateTime.UtcNow,
            Status = SaleStatus.Building,
        };
    }

    public void AddItem(
        Guid medicineId, decimal quantity, decimal unitPrice, decimal discountAmount, decimal discountPercent, decimal unitCostPrice,
        bool isTaxable = true, Guid? batchId = null, string? batchNo = null)
    {
        EnsureNotIrdLocked();
        EnsureBuilding();
        var item = SaleItem.Create(medicineId, quantity, unitPrice, discountAmount, discountPercent, unitCostPrice, isTaxable, batchId, batchNo);
        item.AssignSale(Id, BranchId);
        _items.Add(item);
    }

    /// <summary>Single-tender completion (legacy shape). A shortfall is the balance on account and
    /// requires a customer.</summary>
    public void Finalize(string paymentMethod, decimal paymentAmount)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(paymentMethod);
        Finalize([new SaleTender(paymentMethod, paymentAmount, null)], shortfallIsOnAccount: true);
    }

    /// <summary>
    /// Completes the sale against the given tender legs. Rules (mirror legacy create_sale_with_items):
    /// <list type="bullet">
    /// <item>Every leg has a positive amount; the legs' non-credit total must not exceed the sale total.</item>
    /// <item>A <c>credit</c> leg is the on-account portion. It requires a customer and, together with the
    /// other legs, must cover the total exactly.</item>
    /// <item>Without a credit leg the legs must cover the total. When <paramref name="shortfallIsOnAccount"/>
    /// is set (legacy single-payment shape), any shortfall becomes the balance due instead.</item>
    /// </list>
    /// <see cref="PaymentAmount"/> is the non-credit amount actually received; <see cref="BalanceDue"/>
    /// is the amount owed on account.
    /// </summary>
    public void Finalize(IReadOnlyList<SaleTender> tenders, bool shortfallIsOnAccount)
    {
        EnsureNotIrdLocked();
        EnsureBuilding();
        ArgumentNullException.ThrowIfNull(tenders);

        if (_items.Count == 0)
        {
            throw new CustomException("A sale must have at least one item.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        if (tenders.Count == 0)
        {
            throw new CustomException("At least one payment is required.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        // Money is settled in whole paisa: every leg is rounded to 2 dp and must cover the (rounded) total
        // exactly. There is no ±0.01 tolerance any more — a residual paisa would otherwise be neither
        // received nor owed, and the sale's voucher would not balance.
        var rounded = new List<SaleTender>(tenders.Count);
        foreach (var tender in tenders)
        {
            ArgumentException.ThrowIfNullOrWhiteSpace(tender.Method);
            decimal amount = Money.Round(tender.Amount);
            if (amount <= 0)
            {
                throw new CustomException("Payment amount must be positive.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
            }

            rounded.Add(tender with { Amount = amount });
        }

        IReadOnlyList<SaleTender> legs = rounded;

        decimal total = Money.Round(TotalAmount);
        decimal received = legs.Where(t => !IsCredit(t.Method)).Sum(t => t.Amount);
        decimal onAccount = legs.Where(t => IsCredit(t.Method)).Sum(t => t.Amount);

        if (received > total)
        {
            throw new CustomException(
                $"Payment amount {received} exceeds the sale total {total}.",
                (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        decimal uncovered = total - received - onAccount;
        decimal balanceDue = onAccount;

        if (uncovered > 0m)
        {
            if (!shortfallIsOnAccount && onAccount == 0m)
            {
                throw new CustomException(
                    $"Payments ({received}) must sum to the sale total ({total}), or include a credit line for the balance.",
                    (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
            }

            // Shortfall becomes the balance on account (legacy single-payment shape, or a credit line
            // that does not cover the rest — in which case the credit must equal the balance below).
            if (!shortfallIsOnAccount)
            {
                throw new CustomException(
                    $"Payments ({received}) and credit ({onAccount}) must sum to the sale total ({total}).",
                    (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
            }

            balanceDue += uncovered;
        }
        else if (uncovered < 0m)
        {
            throw new CustomException(
                $"Payment amount {received + onAccount} exceeds the sale total {total}.",
                (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        // A sale on account needs a known customer to carry the AR balance — a walk-in sale must be
        // paid in full.
        if (balanceDue > 0m && CustomerId is null)
        {
            throw new CustomException(
                "A sale on account (partial payment) requires a customer.",
                (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        foreach (var tender in legs)
        {
            var payment = SalePayment.Create(tender.Method, tender.Amount, tender.Reference);
            payment.AssignSale(Id, BranchId);
            _payments.Add(payment);
        }

        PaymentMethod = legs.Count == 1 ? legs[0].Method.Trim() : SalePaymentMethods.Mixed;
        PaymentAmount = received;
        BalanceDue = balanceDue;
        Status = SaleStatus.Completed;
        CreatedAtUtc = DateTime.UtcNow;
    }

    private static bool IsCredit(string method) =>
        string.Equals(method.Trim(), SalePaymentMethods.Credit, StringComparison.OrdinalIgnoreCase);

    public void Cancel(string reason)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(reason);
        EnsureNotIrdLocked();

        if (Status != SaleStatus.Completed)
        {
            throw new CustomException(
                $"Only a completed sale can be cancelled (current status: {Status}).",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        Status = SaleStatus.Cancelled;
        CancelledAtUtc = DateTime.UtcNow;
        CancelReason = reason.Trim();
    }

    /// <summary>Edits the free-text notes. Refused once the sale is IRD-locked (legacy
    /// <c>prevent_locked_sales_modification</c>); allowed on any other status, as the legacy PATCH was.</summary>
    public void UpdateNotes(string? notes)
    {
        EnsureNotIrdLocked();
        Notes = notes?.Trim();
    }

    /// <summary>
    /// Splits the VAT-inclusive total into taxable value, VAT and exempt value. Prices are VAT-inclusive,
    /// so VAT = taxable lines' total × rate / (100 + rate); exempt lines carry no VAT. The three parts
    /// always sum to <see cref="TotalAmount"/>. Called once, when the sale completes.
    /// </summary>
    public void ApplyVat(decimal vatRatePercent)
    {
        EnsureNotIrdLocked();
        if (vatRatePercent < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(vatRatePercent), "VAT rate cannot be negative.");
        }

        decimal taxableGross = _items.Where(i => i.IsTaxable).Sum(i => i.LineTotal);
        decimal vat = vatRatePercent > 0
            ? Math.Round(taxableGross * vatRatePercent / (100m + vatRatePercent), 2, MidpointRounding.AwayFromZero)
            : 0m;

        VatRatePercent = vatRatePercent;
        VatAmount = vat;
        TaxableAmount = taxableGross - vat;
        ExemptAmount = _items.Where(i => !i.IsTaxable).Sum(i => i.LineTotal);
    }

    /// <summary>
    /// Sets the sequential IRD invoice number (see <c>InvoiceNumberService</c>). Write-once: a sale keeps
    /// the number it was issued, and IRD-locked sales can't be renumbered.
    /// </summary>
    public void AssignInvoice(string invoiceNumber, int fiscalYear)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(invoiceNumber);
        EnsureNotIrdLocked();
        if (InvoiceNumber is not null)
        {
            return;
        }

        InvoiceNumber = invoiceNumber.Trim();
        FiscalYear = fiscalYear;
    }

    /// <summary>Assigns an invoice number the first time this sale is sent to IRD; a no-op once one is
    /// already set — the Next.js reference generates a number only when missing and then treats the
    /// sale as effectively locked for that number (scripts/33-ird-invoices-and-narcotic-register.sql's
    /// <c>prevent_locked_sales_modification</c> trigger is a further lock this port does not replicate
    /// — see IRD port notes).</summary>
    public void AssignInvoiceNumberIfMissing(string invoiceNumber)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(invoiceNumber);
        EnsureNotIrdLocked();
        InvoiceNumber ??= invoiceNumber.Trim();
    }

    /// <summary>Applied once the IRD dispatch client (<c>IIrdDispatchClient</c>) reports a successful
    /// send for this sale's queue item.</summary>
    public void MarkIrdSynced(string? externalInvoiceId)
    {
        EnsureNotIrdLocked();
        IrdStatus = IrdSyncStatus.Synced;
        IrdInvoiceId = string.IsNullOrWhiteSpace(externalInvoiceId) ? InvoiceNumber : externalInvoiceId;
        IrdSyncedAtUtc = DateTime.UtcNow;
        IrdError = null;
    }

    /// <summary>Applied after a failed dispatch attempt. <paramref name="isFinalAttempt"/> mirrors the
    /// Next.js reference: the sale only flips to "failed" once the queue item has exhausted its
    /// retries — while retries remain, the sale stays "pending" with the latest error recorded.</summary>
    public void MarkIrdDispatchFailed(string errorMessage, bool isFinalAttempt)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(errorMessage);
        EnsureNotIrdLocked();
        IrdError = errorMessage;
        IrdStatus = isFinalAttempt ? IrdSyncStatus.Failed : IrdSyncStatus.Pending;
    }

    /// <summary>Blocks every mutation once IRD-synced, matching the upstream trigger's
    /// <c>BEFORE UPDATE OR DELETE</c> on <c>sales</c>. Note the trigger covers the sale row only;
    /// sale items are guarded here too because they cannot change without the sale being Building.</summary>
    private void EnsureNotIrdLocked()
    {
        if (IsIrdLocked)
        {
            throw new SaleLockedException(Id);
        }
    }

    private void EnsureBuilding()
    {
        if (Status != SaleStatus.Building)
        {
            throw new CustomException(
                $"Sale is {Status} and can no longer be modified.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
    }
}
