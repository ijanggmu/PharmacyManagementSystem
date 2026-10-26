using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Appointments.Contracts.Dtos;

namespace FSH.Modules.Appointments.Domain;

/// <summary>
/// One payment to a doctor: the sum of their share of the visits it settles. Each settled visit
/// points back at it (<see cref="Appointment.PayoutId"/>), so a visit is paid out at most once.
/// </summary>
public sealed class DoctorPayout : AggregateRoot<Guid>
{
    public Guid DoctorId { get; private set; }
    public Guid? BranchId { get; private set; }
    public decimal Amount { get; private set; }
    public int VisitCount { get; private set; }
    public string PaymentMethod { get; private set; } = default!;
    public string? Note { get; private set; }
    public DateTime PaidAtUtc { get; private set; }
    public Guid? PaidByUserId { get; private set; }
    public string? PaidBy { get; private set; }

    private DoctorPayout() { }

    public static DoctorPayout Pay(
        Guid doctorId, IReadOnlyList<Appointment> visits, string paymentMethod, string? note, Guid? branchId,
        DateTime nowUtc, Guid? paidByUserId, string? paidBy)
    {
        ArgumentNullException.ThrowIfNull(visits);
        ArgumentException.ThrowIfNullOrWhiteSpace(paymentMethod);

        var owed = visits
            .Where(v => v.DoctorId == doctorId && v.HasPaidFee && v.PayoutId is null && v.Status != AppointmentStatus.Cancelled)
            .ToList();
        decimal amount = owed.Sum(v => v.DoctorShareAmount ?? 0m);
        if (owed.Count == 0 || amount <= 0)
        {
            throw new CustomException("Nothing is owed to this doctor right now.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        var payout = new DoctorPayout
        {
            Id = Guid.CreateVersion7(),
            DoctorId = doctorId,
            BranchId = branchId,
            Amount = amount,
            VisitCount = owed.Count,
            PaymentMethod = ConsultationPaymentMethods.Normalize(paymentMethod)
                ?? throw new CustomException("Pick how the doctor is paid.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest),
            Note = Doctor.NormalizeOptional(note),
            PaidAtUtc = nowUtc,
            PaidByUserId = paidByUserId,
            PaidBy = Doctor.NormalizeOptional(paidBy),
        };

        foreach (var visit in owed)
        {
            visit.SettleWith(payout.Id);
        }

        return payout;
    }
}
