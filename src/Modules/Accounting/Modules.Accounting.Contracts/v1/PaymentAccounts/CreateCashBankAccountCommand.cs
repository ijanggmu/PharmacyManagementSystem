using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.PaymentAccounts;

/// <summary>
/// Adds a cash, bank or wallet account (a second bank, an eSewa wallet, a petty-cash till …) in the cash &amp;
/// bank block: the next free <c>10xx</c> code beside Cash 1000 and Bank 1010, under the Assets head. It can't
/// be a sub-account of Bank — Bank takes automatic postings, so it can't become a group account.
/// </summary>
public sealed record CreateCashBankAccountCommand(string Name) : ICommand<Guid>;
