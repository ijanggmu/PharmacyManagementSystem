namespace FSH.Modules.Accounting.Features.v1.Tds;

/// <summary>Voucher type and reference of a TDS deposit with IRD (Dr TDS Payable / Cr Cash-Bank), numbered in the
/// payment (PMT) series.</summary>
public static class TdsVouchers
{
    public const string PaymentVoucherType = "system_tds_payment";
    public const string PaymentReferenceType = "TdsPayment";
}
