namespace FSH.Modules.Accounting.Contracts.Dtos;

/// <summary>
/// The wire values of a cheque's direction and status (lower snake case, as the web app shows and filters them).
/// Received cheques: on_hand → deposited → cleared | bounced, or cancelled while still on hand. Issued cheques:
/// issued → presented → cleared | bounced, or cancelled before the supplier presents it.
/// </summary>
public static class ChequeValues
{
    public const string Received = "received";
    public const string Issued = "issued";

    public const string StatusOnHand = "on_hand";
    public const string StatusDeposited = "deposited";
    public const string StatusIssued = "issued";
    public const string StatusPresented = "presented";
    public const string StatusCleared = "cleared";
    public const string StatusBounced = "bounced";
    public const string StatusCancelled = "cancelled";

    public static IReadOnlyList<string> Directions { get; } = [Received, Issued];

    public static IReadOnlyList<string> Statuses { get; } =
        [StatusOnHand, StatusDeposited, StatusIssued, StatusPresented, StatusCleared, StatusBounced, StatusCancelled];
}

/// <summary>One step in a cheque's life: who moved it, when, to which status and (for a clearance) the voucher posted.</summary>
public sealed record ChequeStatusChangeDto(
    Guid Id,
    string? FromStatus,
    string ToStatus,
    DateTime EffectiveDateUtc,
    DateTime ChangedAtUtc,
    string ChangedBy,
    string? Note,
    Guid? VoucherId);

/// <summary>
/// A cheque in the register. <see cref="PostedToBank"/> = the payment was posted straight to the bank
/// ("cleared on deposit"); otherwise it sits in Cheques in Hand (received) or Cheques Issued (issued) until it clears.
/// <see cref="History"/> is filled by the single-cheque read only.
/// </summary>
public sealed record ChequeDto(
    Guid Id,
    string Direction,
    string Status,
    Guid PartyId,
    string PartyName,
    string? BankName,
    string ChequeNumber,
    DateTime ChequeDateUtc,
    decimal Amount,
    string PaymentReferenceType,
    Guid PaymentReferenceId,
    DateTime PaymentDateUtc,
    bool PostedToBank,
    Guid? BankAccountId,
    DateTime? DepositedDateUtc,
    DateTime? ClearedDateUtc,
    Guid? BranchId,
    string? Notes,
    DateTime CreatedAtUtc,
    IReadOnlyList<ChequeStatusChangeDto>? History = null);
