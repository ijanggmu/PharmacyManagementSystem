using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Appointments.Contracts.Dtos;

namespace FSH.Modules.Appointments.Domain;

public enum AppointmentStatus
{
    Booked = 0,
    Arrived = 1,
    Seen = 2,
    NoShow = 3,
    Cancelled = 4,
}

public enum AppointmentSource
{
    Counter = 0,
    Online = 1,
}

/// <summary>
/// One patient's token in a <see cref="DoctorSession"/>. Moves Booked → Arrived (fee taken) → Seen, or ends as NoShow
/// (from Booked) or Cancelled (from Booked or Arrived). The fee and the doctor's part of it are copied in when taken,
/// so changing the doctor's fee later never changes a visit already paid for.
/// </summary>
public sealed class Appointment : AggregateRoot<Guid>
{
    public Guid SessionId { get; private set; }
    public Guid DoctorId { get; private set; }
    public Guid BranchId { get; private set; }
    public DateOnly Date { get; private set; }
    public int TokenNo { get; private set; }
    public Guid? CustomerId { get; private set; }
    public string PatientName { get; private set; } = default!;
    public string? PatientPhone { get; private set; }
    public AppointmentSource Source { get; private set; }
    public AppointmentStatus Status { get; private set; }
    public string? Note { get; private set; }

    public DateTime BookedAtUtc { get; private set; }
    public Guid? BookedByUserId { get; private set; }
    public DateTime? ArrivedAtUtc { get; private set; }
    public DateTime? SeenAtUtc { get; private set; }
    public DateTime? CancelledAtUtc { get; private set; }
    public string? CancelReason { get; private set; }

    /// <summary>Fee taken when the patient arrived (0 when seen free); null until then.</summary>
    public decimal? FeeAmount { get; private set; }

    /// <summary>The doctor's part of <see cref="FeeAmount"/>, owed until a payout covers it.</summary>
    public decimal? DoctorShareAmount { get; private set; }
    public string? PaymentMethod { get; private set; }
    public DateTime? FeePaidAtUtc { get; private set; }
    public DateTime? FeeRefundedAtUtc { get; private set; }

    /// <summary>The payout that paid the doctor's share of this visit.</summary>
    public Guid? PayoutId { get; private set; }
    public Guid? PrescriptionId { get; private set; }

    /// <summary>Optimistic-concurrency token, mapped to Postgres' <c>xmin</c>.</summary>
    public uint RowVersion { get; }

    private Appointment() { }

    public static Appointment Book(
        DoctorSession session, int tokenNo, string patientName, string? patientPhone, Guid? customerId,
        AppointmentSource source, string? note, DateTime nowUtc, Guid? bookedByUserId)
    {
        ArgumentNullException.ThrowIfNull(session);
        ArgumentException.ThrowIfNullOrWhiteSpace(patientName);
        return new Appointment
        {
            Id = Guid.CreateVersion7(),
            SessionId = session.Id,
            DoctorId = session.DoctorId,
            BranchId = session.BranchId,
            Date = session.Date,
            TokenNo = tokenNo,
            CustomerId = customerId,
            PatientName = patientName.Trim(),
            PatientPhone = Doctor.NormalizeOptional(patientPhone),
            Source = source,
            Status = AppointmentStatus.Booked,
            Note = Doctor.NormalizeOptional(note),
            BookedAtUtc = nowUtc,
            BookedByUserId = bookedByUserId,
        };
    }

    /// <summary>True when a fee was taken and not given back: the visit's money is in the books.</summary>
    public bool HasPaidFee => FeePaidAtUtc is not null && FeeRefundedAtUtc is null && FeeAmount > 0;

    /// <summary>The patient came and paid <paramref name="fee"/> (the doctor gets <paramref name="doctorShare"/> of it).</summary>
    public void MarkArrived(decimal fee, decimal doctorShare, string? paymentMethod, DateTime nowUtc)
    {
        EnsureStatus("mark as arrived", AppointmentStatus.Booked);
        if (fee < 0 || doctorShare < 0 || doctorShare > fee)
        {
            throw BadRequest("The fee and the doctor's share don't add up.");
        }

        if (fee > 0 && string.IsNullOrWhiteSpace(paymentMethod))
        {
            throw BadRequest("Pick how the patient paid.");
        }

        Status = AppointmentStatus.Arrived;
        ArrivedAtUtc = nowUtc;
        FeeAmount = fee;
        DoctorShareAmount = doctorShare;
        PaymentMethod = fee > 0
            ? ConsultationPaymentMethods.Normalize(paymentMethod) ?? throw BadRequest("Pick how the patient paid.")
            : null;
        FeePaidAtUtc = fee > 0 ? nowUtc : null;
    }

    public void MarkSeen(Guid? prescriptionId, DateTime nowUtc)
    {
        EnsureStatus("mark as seen", AppointmentStatus.Arrived);
        Status = AppointmentStatus.Seen;
        SeenAtUtc = nowUtc;
        PrescriptionId = prescriptionId ?? PrescriptionId;
    }

    public void MarkNoShow(DateTime nowUtc)
    {
        EnsureStatus("mark as not come", AppointmentStatus.Booked);
        Status = AppointmentStatus.NoShow;
        CancelledAtUtc = nowUtc;
    }

    /// <summary>Cancels the token. Returns true when a fee was taken and is now to be given back.</summary>
    public bool Cancel(string reason, DateTime nowUtc)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(reason);
        EnsureStatus("cancel", AppointmentStatus.Booked, AppointmentStatus.Arrived);
        if (PayoutId is not null)
        {
            throw new CustomException(
                "The doctor has already been paid for this visit, so it can't be cancelled.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        bool refund = HasPaidFee;
        Status = AppointmentStatus.Cancelled;
        CancelledAtUtc = nowUtc;
        CancelReason = reason.Trim();
        if (refund)
        {
            FeeRefundedAtUtc = nowUtc;
        }

        return refund;
    }

    /// <summary>The doctor's share of this visit is paid by <paramref name="payoutId"/>.</summary>
    internal void SettleWith(Guid payoutId) => PayoutId = payoutId;

    public void LinkCustomer(Guid customerId) => CustomerId = customerId;

    private void EnsureStatus(string action, params AppointmentStatus[] allowed)
    {
        if (!allowed.Contains(Status))
        {
            throw new CustomException(
                $"Can't {action} a token that is {Describe(Status)}.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
    }

    private static string Describe(AppointmentStatus status) => status switch
    {
        AppointmentStatus.Booked => "booked",
        AppointmentStatus.Arrived => "already arrived",
        AppointmentStatus.Seen => "already seen",
        AppointmentStatus.NoShow => "marked as not come",
        _ => "cancelled",
    };

    private static CustomException BadRequest(string message) =>
        new(message, (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
}
