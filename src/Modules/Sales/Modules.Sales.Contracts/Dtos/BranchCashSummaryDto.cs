namespace FSH.Modules.Sales.Contracts.Dtos;

/// <summary>
/// Expected cash in the drawer for one branch with an open shift. <see cref="ExpectedInDrawer"/> is
/// <c>OpeningFloat + CashSalesSinceOpen - CashRefundsSinceOpen</c>, where cash sales count completed sales at that branch
/// since the shift opened (cash legs only; credit legs are on account and excluded).
/// </summary>
public sealed record BranchCashSummaryDto(
    Guid BranchId,
    string BranchName,
    Guid OpenShiftId,
    decimal OpeningFloat,
    decimal CashSalesSinceOpen,
    decimal ExpectedInDrawer,
    // Cash paid back out for returns/refunds completed at the branch since the shift opened.
    decimal CashRefundsSinceOpen = 0m,
    // Cash customers paid against their accounts at the branch since the shift opened.
    decimal CashReceiptsSinceOpen = 0m,
    // Net cash from the doctors' desk since the shift opened (consultation fees in, fees given back and doctors paid out).
    decimal ConsultationCashSinceOpen = 0m);
