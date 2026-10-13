namespace FSH.Modules.Accounting.Domain;

/// <summary>Voucher and reference types of the vouchers Accounting books for payroll runs (Payroll module events).</summary>
public static class PayrollVoucherTypes
{
    /// <summary>A posted run's accrual journal (JV series).</summary>
    public const string Accrual = "system_payroll";

    /// <summary>A paid run's salary payment (PMT series).</summary>
    public const string Payment = "system_payroll_payment";

    /// <summary>Reference type of the accrual voucher; the reference id is the run id.</summary>
    public const string AccrualReference = "PayrollRun";

    /// <summary>Reference type of the payment voucher; the reference id is the run id.</summary>
    public const string PaymentReference = "PayrollPayment";
}
