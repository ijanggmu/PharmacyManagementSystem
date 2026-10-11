namespace FSH.Modules.Accounting.Contracts.Dtos;

/// <summary>
/// Output-VAT summary for a period: only VAT collected on sales (credits to the VAT Payable
/// account) is tracked in this pass — input VAT (VAT paid on purchases, reclaimable against output
/// VAT) is not yet modeled, since Purchasing doesn't post a separate input-VAT line. Until that
/// exists, <see cref="NetVatPayable"/> equals <see cref="VatCollected"/>.
/// </summary>
public sealed record VatReturnReportDto(
    DateTime FromUtc,
    DateTime ToUtc,
    decimal VatCollected,
    decimal VatRefundedOrAdjusted,
    decimal NetVatPayable,
    // Input VAT recoverable on purchases (account 1150): debits less credits for the period.
    decimal InputVat = 0m,
    // Output VAT net of input VAT — what is actually owed to IRD for the period.
    decimal NetVatDue = 0m,
    // The branch the figures are for; null = all branches.
    Guid? BranchId = null);
