namespace FSH.Modules.Accounting.Contracts.Dtos;

/// <summary>A subledger total (Customers' AR, Suppliers' AP, or Inventory's stock valuation) compared
/// against its GL control account balance. A non-zero <see cref="Variance"/> means the subledger and
/// the GL have drifted — most likely a dead-lettered integration event (see
/// docs/pharmacy-modules-plan.md §2.2's accepted residual risk) that never posted its GL side.</summary>
public sealed record GlReconciliationDto(
    string SubledgerName,
    DateTime AsOfUtc,
    decimal SubledgerTotal,
    decimal GlBalance,
    decimal Variance,
    // The branch both sides were filtered to; null = all branches.
    Guid? BranchId = null,
    // The moment the subledger figure describes. Equals AsOfUtc when the subledger can be read as of a
    // date (AR, AP); the stock valuation has no history, so for Inventory it is always "now" — a past
    // AsOfUtc then compares today's stock with the GL as of that date.
    DateTime? SubledgerAsOfUtc = null);
