using Mediator;

namespace FSH.Modules.Onboarding.Contracts.v1.Onboarding;

/// <summary>
/// One-time opening-balance entry for a tenant migrating from another system. Posts one balanced GL
/// voucher: Dr Cash/Bank/Inventory/Accounts Receivable (whichever are non-zero), Cr Accounts Payable,
/// with the remainder plugged to Owner's Equity (credit if assets exceed liabilities, debit — an
/// opening deficit — otherwise). Rejected (409) if onboarding has already been completed for this
/// tenant, or if every amount is zero.
///
/// Deliberately does NOT also create opening customers/suppliers/stock — those already have their
/// own opening-balance support (<c>CreateCustomerCommand</c>/<c>CreateSupplierCommand</c>'s
/// <c>openingBalance</c> parameter, and stock received via the normal receipt/consignment paths
/// before this runs). This command only closes the gap those don't cover: the top-level balance
/// sheet entry that ties everything together.
/// </summary>
public sealed record CompleteOnboardingCommand(
    decimal OpeningCash,
    decimal OpeningBank,
    decimal OpeningInventoryValue,
    decimal OpeningAccountsReceivable,
    decimal OpeningAccountsPayable,
    string? Notes = null) : ICommand<Guid>;
