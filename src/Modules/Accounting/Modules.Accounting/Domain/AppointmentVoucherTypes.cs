namespace FSH.Modules.Accounting.Domain;

/// <summary>Voucher and reference types of the doctor-appointment postings.</summary>
public static class AppointmentVoucherTypes
{
    /// <summary>A consultation fee taken (RCT series).</summary>
    public const string Fee = "system_consultation_fee";

    /// <summary>A doctor paid their share (PMT series).</summary>
    public const string Payout = "system_doctor_payout";

    /// <summary>Reference type of the fee voucher; the reference id is the appointment id.</summary>
    public const string FeeReference = "ConsultationFee";

    /// <summary>Reference type of the payout voucher; the reference id is the payout id.</summary>
    public const string PayoutReference = "DoctorPayout";
}
