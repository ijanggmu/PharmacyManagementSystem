using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Dtos;

namespace FSH.Modules.Accounting.Domain;

public enum ChequeDirection
{
    /// <summary>From a customer (a receipt).</summary>
    Received = 0,

    /// <summary>To a supplier (a payment).</summary>
    Issued = 1,
}

public enum ChequeStatus
{
    /// <summary>Received, not yet deposited.</summary>
    OnHand = 0,

    /// <summary>Received and deposited in the bank, waiting to clear.</summary>
    Deposited = 1,

    /// <summary>Given to the supplier, not yet presented to our bank.</summary>
    Issued = 2,

    /// <summary>Presented by the supplier, waiting to clear.</summary>
    Presented = 3,

    /// <summary>Paid by the bank — final.</summary>
    Cleared = 4,

    /// <summary>Returned unpaid by the bank; the payment was voided — final.</summary>
    Bounced = 5,

    /// <summary>Withdrawn before it reached the bank (or its payment was voided); the payment was voided — final.</summary>
    Cancelled = 6,
}

/// <summary>
/// A cheque in the register — received from a customer or issued to a supplier, created by Accounting when the
/// customer receipt / supplier payment it settled is posted (see the payment-recorded integration event handlers).
///
/// <para><b>Accounting.</b> A post-dated cheque is not money in the bank: its receipt is posted to Cheques in Hand
/// (1160) and its payment to Cheques Issued (2160); clearing it moves the amount to the bank with a contra voucher
/// (<see cref="ClearancePostsVoucher"/>). With <see cref="PostedToBank"/> ("cleared on deposit") the payment already
/// went to the bank, so clearing only changes the status. A bounce or a cancellation voids the payment through the
/// party's own void path, which reverses the payment voucher — never a clearance, so a cleared cheque is final.</para>
///
/// <para><b>Lifecycle.</b> Received: on hand → deposited → cleared | bounced; cancelled while on hand. Issued: issued →
/// presented → cleared | bounced; cancelled while not yet presented. A cheque can be cleared or bounced straight
/// from on hand / issued (the deposit step is optional). Every move adds a <see cref="ChequeStatusChange"/>.</para>
/// </summary>
public sealed class Cheque : AggregateRoot<Guid>
{
    public const string CustomerPaymentReference = "CustomerPayment";
    public const string SupplierPaymentReference = "SupplierPayment";

    public const int ChequeNumberMaxLength = 32;
    public const int BankNameMaxLength = 128;
    public const int PartyNameMaxLength = 256;
    public const int NoteMaxLength = 512;

    private readonly List<ChequeStatusChange> _history = [];

    public ChequeDirection Direction { get; private set; }
    public ChequeStatus Status { get; private set; }

    /// <summary>The customer (received) or supplier (issued).</summary>
    public Guid PartyId { get; private set; }
    public string PartyName { get; private set; } = default!;

    /// <summary>The bank the cheque is drawn on, as written on it.</summary>
    public string? BankName { get; private set; }
    public string ChequeNumber { get; private set; } = default!;

    /// <summary>The date written on the cheque — later than the payment date for a post-dated cheque.</summary>
    public DateTime ChequeDateUtc { get; private set; }
    public decimal Amount { get; private set; }

    /// <summary>The payment the cheque settled: <c>CustomerPayment</c> / <c>SupplierPayment</c> + its ledger entry id —
    /// the same reference its GL voucher is posted under.</summary>
    public string PaymentReferenceType { get; private set; } = default!;
    public Guid PaymentReferenceId { get; private set; }
    public DateTime PaymentDateUtc { get; private set; }

    /// <summary>True when the payment was posted straight to the bank ("cleared on deposit"), so nothing moves at clearance.</summary>
    public bool PostedToBank { get; private set; }

    /// <summary>The cash/bank (10xx) account it was deposited into or cleared through.</summary>
    public Guid? BankAccountId { get; private set; }
    public DateTime? DepositedDateUtc { get; private set; }
    public DateTime? ClearedDateUtc { get; private set; }

    /// <summary>The branch the payment was recorded at (null on events without one).</summary>
    public Guid? BranchId { get; private set; }
    public string? Notes { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? UpdatedAtUtc { get; private set; }

    public IReadOnlyList<ChequeStatusChange> History => _history;

    private Cheque() { }

    public static Cheque CreateReceived(
        Guid customerId, string customerName, string chequeNumber, DateTime chequeDateUtc, string? bankName, decimal amount,
        Guid paymentId, DateTime paymentDateUtc, bool postedToBank, Guid? branchId, string? notes = null) =>
        Create(ChequeDirection.Received, customerId, customerName, chequeNumber, chequeDateUtc, bankName, amount,
            CustomerPaymentReference, paymentId, paymentDateUtc, postedToBank, branchId, notes);

    public static Cheque CreateIssued(
        Guid supplierId, string supplierName, string chequeNumber, DateTime chequeDateUtc, string? bankName, decimal amount,
        Guid paymentId, DateTime paymentDateUtc, bool postedToBank, Guid? branchId, string? notes = null) =>
        Create(ChequeDirection.Issued, supplierId, supplierName, chequeNumber, chequeDateUtc, bankName, amount,
            SupplierPaymentReference, paymentId, paymentDateUtc, postedToBank, branchId, notes);

    private static Cheque Create(
        ChequeDirection direction, Guid partyId, string partyName, string chequeNumber, DateTime chequeDateUtc, string? bankName,
        decimal amount, string referenceType, Guid paymentId, DateTime paymentDateUtc, bool postedToBank, Guid? branchId, string? notes)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(partyName);
        ArgumentException.ThrowIfNullOrWhiteSpace(chequeNumber);
        if (amount <= 0m)
        {
            throw new ArgumentOutOfRangeException(nameof(amount), "A cheque amount must be positive.");
        }

        if (paymentId == Guid.Empty)
        {
            throw new ArgumentException("The cheque must name the payment it settled.", nameof(paymentId));
        }

        // A cheque posted straight to the bank is already as good as deposited (received) — an issued one is
        // still with the supplier until presented.
        ChequeStatus initial = ChequeStatus.Issued;
        if (direction == ChequeDirection.Received)
        {
            initial = postedToBank ? ChequeStatus.Deposited : ChequeStatus.OnHand;
        }

        DateTime now = DateTime.UtcNow;
        var cheque = new Cheque
        {
            Id = Guid.CreateVersion7(),
            Direction = direction,
            Status = initial,
            PartyId = partyId,
            PartyName = Truncate(partyName.Trim(), PartyNameMaxLength),
            BankName = string.IsNullOrWhiteSpace(bankName) ? null : Truncate(bankName.Trim(), BankNameMaxLength),
            ChequeNumber = Truncate(chequeNumber.Trim(), ChequeNumberMaxLength),
            ChequeDateUtc = chequeDateUtc,
            Amount = amount,
            PaymentReferenceType = referenceType,
            PaymentReferenceId = paymentId,
            PaymentDateUtc = paymentDateUtc,
            PostedToBank = postedToBank,
            DepositedDateUtc = direction == ChequeDirection.Received && postedToBank ? paymentDateUtc : null,
            BranchId = branchId,
            Notes = string.IsNullOrWhiteSpace(notes) ? null : Truncate(notes.Trim(), NoteMaxLength),
            CreatedAtUtc = now,
        };
        cheque._history.Add(ChequeStatusChange.Create(
            cheque.Id, null, initial, paymentDateUtc, "system",
            postedToBank ? "Recorded with the payment; posted straight to the bank" : "Recorded with the payment", null));
        return cheque;
    }

    /// <summary>A post-dated cheque moves its amount to the bank at clearance; one posted to the bank already did.</summary>
    public bool ClearancePostsVoucher => !PostedToBank;

    public bool IsFinal => Status is ChequeStatus.Cleared or ChequeStatus.Bounced or ChequeStatus.Cancelled;

    /// <summary>Deposited (received) / presented (issued) is possible from on hand / issued.</summary>
    public bool CanDeposit => Status is ChequeStatus.OnHand or ChequeStatus.Issued;

    public bool CanClear => !IsFinal;

    public bool CanBounce => !IsFinal;

    public bool CanCancel => Status is ChequeStatus.OnHand or ChequeStatus.Issued;

    /// <summary>Waiting for action on <paramref name="today"/> (a Nepal day): not yet cleared, bounced or cancelled, and
    /// its date has come — a received cheque can be banked, an issued one may be presented any time.</summary>
    public bool IsDueOn(DateOnly today) => !IsFinal && Day(ChequeDateUtc) <= today;

    /// <summary>Received: deposited in the bank. Issued: presented by the supplier. No posting.</summary>
    public ChequeStatusChange Deposit(DateTime depositDateUtc, Guid? bankAccountId, string by, string? note)
    {
        if (!CanDeposit)
        {
            throw Conflict(Direction == ChequeDirection.Received
                ? $"Cheque {ChequeNumber} is {Describe(Status)} — only a cheque on hand can be deposited."
                : $"Cheque {ChequeNumber} is {Describe(Status)} — only an issued cheque can be marked presented.");
        }

        EnsureNotBefore(depositDateUtc, PaymentDateUtc, "the payment it settled");
        DepositedDateUtc = depositDateUtc;
        BankAccountId = bankAccountId ?? BankAccountId;
        return Move(Direction == ChequeDirection.Received ? ChequeStatus.Deposited : ChequeStatus.Presented, depositDateUtc, by, note);
    }

    /// <summary>The bank paid the cheque. The caller posts the clearance voucher when <see cref="ClearancePostsVoucher"/>.</summary>
    public ChequeStatusChange Clear(DateTime clearedDateUtc, Guid? bankAccountId, string by, string? note)
    {
        if (!CanClear)
        {
            throw Conflict($"Cheque {ChequeNumber} is already {Describe(Status)}.");
        }

        EnsureNotBefore(clearedDateUtc, PaymentDateUtc, "the payment it settled");

        // A bank pays a cheque on or after the date written on it, never before.
        EnsureNotBefore(clearedDateUtc, ChequeDateUtc, "the date on the cheque");
        if (DepositedDateUtc is { } deposited)
        {
            EnsureNotBefore(clearedDateUtc, deposited, "its deposit");
        }

        ClearedDateUtc = clearedDateUtc;
        BankAccountId = bankAccountId ?? BankAccountId;
        return Move(ChequeStatus.Cleared, clearedDateUtc, by, note);
    }

    /// <summary>The bank returned it unpaid. The caller voids the payment.</summary>
    public ChequeStatusChange Bounce(DateTime bouncedAtUtc, string by, string reason)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(reason);
        if (!CanBounce)
        {
            throw Conflict($"Cheque {ChequeNumber} is already {Describe(Status)}" +
                (Status == ChequeStatus.Cleared ? " — a cleared cheque can't bounce. Void the payment instead if it was refunded." : "."));
        }

        return Move(ChequeStatus.Bounced, bouncedAtUtc, by, reason);
    }

    /// <summary>Withdrawn before it reached the bank. The caller voids the payment.</summary>
    public ChequeStatusChange Cancel(DateTime cancelledAtUtc, string by, string reason)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(reason);
        if (!CanCancel)
        {
            throw Conflict(Direction == ChequeDirection.Received
                ? $"Cheque {ChequeNumber} is {Describe(Status)} — only a cheque still on hand can be cancelled. A deposited cheque that comes back unpaid has bounced."
                : $"Cheque {ChequeNumber} is {Describe(Status)} — only a cheque the supplier has not presented can be cancelled.");
        }

        return Move(ChequeStatus.Cancelled, cancelledAtUtc, by, reason);
    }

    /// <summary>
    /// The payment the cheque settled was voided outside the register (from the party's ledger). A cheque still in
    /// play is cancelled; one already final is left alone. Returns false when nothing changed.
    /// </summary>
    public bool CancelForVoidedPayment(DateTime voidedAtUtc, string reason)
    {
        if (IsFinal)
        {
            return false;
        }

        Move(ChequeStatus.Cancelled, voidedAtUtc, "system", Truncate($"Payment voided: {reason}", NoteMaxLength));
        return true;
    }

    private ChequeStatusChange Move(ChequeStatus to, DateTime effectiveDateUtc, string by, string? note)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(by);
        var change = ChequeStatusChange.Create(
            Id, Status, to, effectiveDateUtc, Truncate(by.Trim(), 256),
            string.IsNullOrWhiteSpace(note) ? null : Truncate(note.Trim(), NoteMaxLength), null);
        _history.Add(change);
        Status = to;
        UpdatedAtUtc = DateTime.UtcNow;
        return change;
    }

    private void EnsureNotBefore(DateTime date, DateTime earliest, string what)
    {
        // Compared by Nepal day: a same-day action entered as that day's midnight is fine.
        if (Day(date) < Day(earliest))
        {
            throw new CustomException(
                $"Cheque {ChequeNumber}: the date can't be before {what}.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }
    }

    private static DateOnly Day(DateTime utc) => Services.NepalDate.FromUtc(utc);

    /// <summary>The wire value of a direction (see <see cref="ChequeValues"/>).</summary>
    public static string ToWire(ChequeDirection direction) =>
        direction == ChequeDirection.Received ? ChequeValues.Received : ChequeValues.Issued;

    /// <summary>The wire value of a status (see <see cref="ChequeValues"/>).</summary>
    public static string ToWire(ChequeStatus status) => status switch
    {
        ChequeStatus.OnHand => ChequeValues.StatusOnHand,
        ChequeStatus.Deposited => ChequeValues.StatusDeposited,
        ChequeStatus.Issued => ChequeValues.StatusIssued,
        ChequeStatus.Presented => ChequeValues.StatusPresented,
        ChequeStatus.Cleared => ChequeValues.StatusCleared,
        ChequeStatus.Bounced => ChequeValues.StatusBounced,
        _ => ChequeValues.StatusCancelled,
    };

    public static ChequeStatus? StatusFromWire(string? value) => Canonical(value, ChequeValues.Statuses) switch
    {
        ChequeValues.StatusOnHand => ChequeStatus.OnHand,
        ChequeValues.StatusDeposited => ChequeStatus.Deposited,
        ChequeValues.StatusIssued => ChequeStatus.Issued,
        ChequeValues.StatusPresented => ChequeStatus.Presented,
        ChequeValues.StatusCleared => ChequeStatus.Cleared,
        ChequeValues.StatusBounced => ChequeStatus.Bounced,
        ChequeValues.StatusCancelled => ChequeStatus.Cancelled,
        _ => null,
    };

    public static ChequeDirection? DirectionFromWire(string? value) => Canonical(value, ChequeValues.Directions) switch
    {
        ChequeValues.Received => ChequeDirection.Received,
        ChequeValues.Issued => ChequeDirection.Issued,
        _ => null,
    };

    private static string? Canonical(string? value, IReadOnlyList<string> known)
    {
        string? trimmed = value?.Trim();
        return known.FirstOrDefault(k => string.Equals(k, trimmed, StringComparison.OrdinalIgnoreCase));
    }

    private static string Describe(ChequeStatus status) => ToWire(status).Replace('_', ' ');

    private static CustomException Conflict(string message) =>
        new(message, (IEnumerable<string>?)null, HttpStatusCode.Conflict);

    private static string Truncate(string value, int max) => value.Length <= max ? value : value[..max];
}

/// <summary>One status move of a <see cref="Cheque"/>. Reached only through <see cref="Cheque.History"/>.</summary>
public sealed class ChequeStatusChange : BaseEntity<Guid>
{
    public Guid ChequeId { get; private set; }

    /// <summary>Null on the entry that recorded the cheque.</summary>
    public ChequeStatus? FromStatus { get; private set; }
    public ChequeStatus ToStatus { get; private set; }

    /// <summary>The business date of the move (deposit date, clearance date, …).</summary>
    public DateTime EffectiveDateUtc { get; private set; }
    public DateTime ChangedAtUtc { get; private set; }
    public string ChangedBy { get; private set; } = default!;
    public string? Note { get; private set; }

    /// <summary>The voucher the move posted (a clearance of a post-dated cheque).</summary>
    public Guid? VoucherId { get; private set; }

    private ChequeStatusChange() { }

    internal static ChequeStatusChange Create(
        Guid chequeId, ChequeStatus? from, ChequeStatus to, DateTime effectiveDateUtc, string changedBy, string? note, Guid? voucherId) =>
        new()
        {
            Id = Guid.CreateVersion7(),
            ChequeId = chequeId,
            FromStatus = from,
            ToStatus = to,
            EffectiveDateUtc = effectiveDateUtc,
            ChangedAtUtc = DateTime.UtcNow,
            ChangedBy = changedBy,
            Note = note,
            VoucherId = voucherId,
        };

    public void AttachVoucher(Guid voucherId) => VoucherId = voucherId;
}
