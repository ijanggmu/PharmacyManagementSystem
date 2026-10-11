using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Expenses;

/// <summary>Posts Dr General Expenses / Cr Cash or Bank (per <paramref name="PaymentMethod"/>)
/// immediately. <paramref name="PaymentMethod"/> picks the credit account: "Cash" credits Cash, anything
/// else (bank, card, other) credits Bank, so it stays required. <paramref name="ReceiptReference"/> is an
/// optional bill/receipt number kept on the expense and shown in the voucher narration.</summary>
public sealed record RecordExpenseCommand(
    DateTime ExpenseDateUtc,
    string Category,
    decimal Amount,
    string PaymentMethod,
    string? Description = null,
    string? ReceiptReference = null) : ICommand<Guid>;
