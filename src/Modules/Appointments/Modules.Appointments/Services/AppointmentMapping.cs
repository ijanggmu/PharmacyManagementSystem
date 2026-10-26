using FSH.Modules.Appointments.Contracts.Dtos;
using FSH.Modules.Appointments.Domain;

namespace FSH.Modules.Appointments.Services;

internal static class AppointmentMapping
{
    public static AppointmentDto ToDto(Appointment a, DoctorSession session, string doctorName)
    {
        ArgumentNullException.ThrowIfNull(a);
        ArgumentNullException.ThrowIfNull(session);
        return new AppointmentDto(
            a.Id,
            a.SessionId,
            a.DoctorId,
            doctorName,
            a.BranchId,
            a.Date,
            session.StartTime,
            session.EndTime,
            a.TokenNo,
            a.CustomerId,
            a.PatientName,
            a.PatientPhone,
            a.Source.ToString(),
            a.Status.ToString(),
            a.Note,
            a.BookedAtUtc,
            a.ArrivedAtUtc,
            a.SeenAtUtc,
            a.CancelledAtUtc,
            a.CancelReason,
            a.FeeAmount,
            a.DoctorShareAmount,
            a.PaymentMethod,
            a.FeePaidAtUtc,
            a.FeeRefundedAtUtc,
            a.PayoutId,
            a.PrescriptionId);
    }

    public static DoctorPayoutDto ToDto(DoctorPayout p, string doctorName)
    {
        ArgumentNullException.ThrowIfNull(p);
        return new DoctorPayoutDto(
            p.Id, p.DoctorId, doctorName, p.BranchId, p.Amount, p.VisitCount, p.PaymentMethod, p.Note, p.PaidAtUtc, p.PaidBy);
    }
}
