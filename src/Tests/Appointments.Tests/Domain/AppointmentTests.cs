using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Appointments.Domain;

namespace Appointments.Tests.Domain;

public sealed class AppointmentTests
{
    private static readonly DateTime Now = new(2026, 11, 1, 6, 0, 0, DateTimeKind.Utc);
    private static readonly DateOnly Sunday = new(2026, 11, 1);

    private static DoctorSession Session(int maxTokens = 2) =>
        DoctorSession.Create(Guid.CreateVersion7(), Guid.CreateVersion7(), Sunday, new TimeOnly(16, 0), new TimeOnly(19, 0), maxTokens, false);

    private static Appointment Book(DoctorSession session) =>
        Appointment.Book(session, session.IssueToken(), " Hari ", " 9800000000 ", null, AppointmentSource.Counter, null, Now, null);

    [Fact]
    public void Tokens_count_up_and_a_full_sitting_refuses_more()
    {
        var session = Session(maxTokens: 2);

        Book(session).TokenNo.ShouldBe(1);
        Book(session).TokenNo.ShouldBe(2);

        session.IsFull.ShouldBeTrue();
        Should.Throw<CustomException>(() => session.IssueToken()).StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    [Fact]
    public void A_cancelled_token_frees_its_place_but_its_number_is_not_reused()
    {
        var session = Session(maxTokens: 2);
        Book(session);
        var second = Book(session);

        second.Cancel("Patient called", Now);
        session.ReleasePlace();

        session.BookedCount.ShouldBe(1);
        Book(session).TokenNo.ShouldBe(3);
    }

    [Fact]
    public void Resize_never_shrinks_below_the_patients_booked()
    {
        var session = Session(maxTokens: 5);
        Book(session);
        Book(session);

        session.Resize(new TimeOnly(18, 0), maxTokens: 1);

        session.MaxTokens.ShouldBe(2);
        session.EndTime.ShouldBe(new TimeOnly(18, 0));
    }

    [Fact]
    public void Booking_keeps_the_patient_and_the_sitting()
    {
        var session = Session();
        var appointment = Book(session);

        appointment.PatientName.ShouldBe("Hari");
        appointment.PatientPhone.ShouldBe("9800000000");
        appointment.SessionId.ShouldBe(session.Id);
        appointment.DoctorId.ShouldBe(session.DoctorId);
        appointment.Date.ShouldBe(Sunday);
        appointment.Status.ShouldBe(AppointmentStatus.Booked);
    }

    [Fact]
    public void Arriving_takes_the_fee_and_stores_the_method_by_its_canonical_name()
    {
        var appointment = Book(Session());

        appointment.MarkArrived(500m, 400m, " ESEWA ", Now);

        appointment.Status.ShouldBe(AppointmentStatus.Arrived);
        appointment.FeeAmount.ShouldBe(500m);
        appointment.DoctorShareAmount.ShouldBe(400m);
        appointment.PaymentMethod.ShouldBe("esewa");
        appointment.FeePaidAtUtc.ShouldBe(Now);
        appointment.HasPaidFee.ShouldBeTrue();
    }

    [Fact]
    public void A_free_visit_needs_no_payment_method_and_is_not_a_paid_fee()
    {
        var appointment = Book(Session());

        appointment.MarkArrived(0m, 0m, null, Now);

        appointment.PaymentMethod.ShouldBeNull();
        appointment.FeePaidAtUtc.ShouldBeNull();
        appointment.HasPaidFee.ShouldBeFalse();
    }

    [Theory]
    [InlineData(500, 400, null)]
    [InlineData(500, 400, "bitcoin")]
    [InlineData(500, 600, "cash")]
    [InlineData(-1, 0, "cash")]
    public void Arriving_refuses_a_fee_that_doesnt_add_up_or_has_no_known_method(decimal fee, decimal share, string? method)
    {
        Should.Throw<CustomException>(() => Book(Session()).MarkArrived(fee, share, method, Now));
    }

    [Fact]
    public void The_token_moves_only_forward()
    {
        var appointment = Book(Session());

        Should.Throw<CustomException>(() => appointment.MarkSeen(null, Now));
        appointment.MarkArrived(500m, 400m, "cash", Now);
        Should.Throw<CustomException>(() => appointment.MarkNoShow(Now));

        var prescriptionId = Guid.CreateVersion7();
        appointment.MarkSeen(prescriptionId, Now);
        appointment.Status.ShouldBe(AppointmentStatus.Seen);
        appointment.PrescriptionId.ShouldBe(prescriptionId);
        Should.Throw<CustomException>(() => appointment.Cancel("Too late", Now));
    }

    [Fact]
    public void Cancelling_after_the_fee_was_taken_gives_it_back()
    {
        var booked = Book(Session());
        booked.Cancel("Changed mind", Now).ShouldBeFalse();

        var arrived = Book(Session());
        arrived.MarkArrived(500m, 400m, "cash", Now);
        arrived.Cancel("Doctor left early", Now).ShouldBeTrue();
        arrived.FeeRefundedAtUtc.ShouldBe(Now);
        arrived.HasPaidFee.ShouldBeFalse();
        arrived.Status.ShouldBe(AppointmentStatus.Cancelled);
    }

    [Fact]
    public void A_visit_already_paid_out_to_the_doctor_cant_be_cancelled()
    {
        var doctorId = Guid.CreateVersion7();
        var session = DoctorSession.Create(doctorId, Guid.CreateVersion7(), Sunday, new TimeOnly(16, 0), new TimeOnly(19, 0), 5, false);
        var visit = Book(session);
        visit.MarkArrived(500m, 400m, "cash", Now);
        DoctorPayout.Pay(doctorId, [visit], "cash", null, null, Now, null, null);

        Should.Throw<CustomException>(() => visit.Cancel("Oops", Now)).StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    [Fact]
    public void A_payout_sums_only_the_doctors_unpaid_paid_visits_and_settles_them()
    {
        var doctorId = Guid.CreateVersion7();
        var session = DoctorSession.Create(doctorId, Guid.CreateVersion7(), Sunday, new TimeOnly(16, 0), new TimeOnly(19, 0), 10, false);
        var paid1 = Book(session);
        paid1.MarkArrived(500m, 400m, "cash", Now);
        var paid2 = Book(session);
        paid2.MarkArrived(300m, 240m, "esewa", Now);
        var free = Book(session);
        free.MarkArrived(0m, 0m, null, Now);
        var refunded = Book(session);
        refunded.MarkArrived(500m, 400m, "cash", Now);
        refunded.Cancel("Left", Now);
        var notArrived = Book(session);

        var payout = DoctorPayout.Pay(doctorId, [paid1, paid2, free, refunded, notArrived], "Bank", " Weekly ", null, Now, null, "Owner");

        payout.Amount.ShouldBe(640m);
        payout.VisitCount.ShouldBe(2);
        payout.PaymentMethod.ShouldBe("bank");
        payout.Note.ShouldBe("Weekly");
        paid1.PayoutId.ShouldBe(payout.Id);
        paid2.PayoutId.ShouldBe(payout.Id);
        free.PayoutId.ShouldBeNull();
        notArrived.PayoutId.ShouldBeNull();

        Should.Throw<CustomException>(() => DoctorPayout.Pay(doctorId, [paid1, paid2], "cash", null, null, Now, null, null));
    }
}
