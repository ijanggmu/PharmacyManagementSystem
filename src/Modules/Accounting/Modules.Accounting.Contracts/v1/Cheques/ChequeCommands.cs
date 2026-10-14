using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Cheques;

/// <summary>
/// Received cheque: deposited in the bank (status only — the money is not in the bank until it clears).
/// Issued cheque: presented by the supplier. <c>BankAccountId</c> (a 10xx cash/bank account) is the account the
/// cheque was deposited into / is drawn on; it becomes the default for the clearance.
/// </summary>
public sealed record DepositChequeCommand(
    Guid ChequeId, DateTime DepositDateUtc, Guid? BankAccountId = null, string? Note = null) : ICommand<ChequeDto>;

/// <summary>
/// The bank honoured the cheque. A post-dated cheque posts a contra voucher dated <c>ClearedDateUtc</c>: received
/// Dr Bank / Cr Cheques in Hand, issued Dr Cheques Issued / Cr Bank (refused in a locked period). A cheque already
/// posted to the bank ("cleared on deposit") only changes status. <c>BankAccountId</c> defaults to the deposit
/// account, else the tenant's "cheque" payment account.
/// </summary>
public sealed record ClearChequeCommand(
    Guid ChequeId, DateTime ClearedDateUtc, Guid? BankAccountId = null, string? Note = null) : ICommand<ChequeDto>;

/// <summary>
/// The bank returned the cheque unpaid. The payment it settled is voided through the customer / supplier payment
/// void path, so the party owes (or is owed) the amount again and the GL voucher is reversed (dated today, or the
/// first open day). Needs the void-payment permission of that party's module as well. A cheque already marked cleared
/// can bounce too: a post-dated one also gets its clearance voucher reversed. This is the only way to void the payment
/// of a cleared cheque — the party's ledger refuses it. <paramref name="BouncedDateUtc"/> is the business day the bank
/// returned it (default today); the bounce and the clearance reversal carry it.
/// </summary>
public sealed record BounceChequeCommand(Guid ChequeId, string Reason, DateTime? BouncedDateUtc = null) : ICommand<ChequeDto>;

/// <summary>
/// The cheque will not be presented (returned to the customer, or torn up before the supplier banked it). Voids the
/// payment like a bounce. Only a received cheque still on hand or an issued cheque not yet presented can be cancelled.
/// </summary>
public sealed record CancelChequeCommand(Guid ChequeId, string Reason) : ICommand<ChequeDto>;
