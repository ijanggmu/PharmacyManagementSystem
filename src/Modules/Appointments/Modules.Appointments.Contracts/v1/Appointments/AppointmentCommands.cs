using FSH.Modules.Appointments.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Appointments.Contracts.v1.Appointments;

/// <summary>Books the next token in the doctor's sitting that starts at <see cref="StartTime"/> on <see cref="Date"/>.
/// <see cref="CustomerId"/> links an existing customer; the patient's name and phone are kept either way.</summary>
public sealed record BookTokenCommand(
    Guid DoctorId,
    DateOnly Date,
    TimeOnly StartTime,
    string PatientName,
    string? PatientPhone,
    Guid? CustomerId = null,
    string? Note = null) : ICommand<AppointmentDto>;

/// <summary>The patient came: takes <see cref="Fee"/> (0 = no fee) by <see cref="PaymentMethod"/>
/// (<see cref="ConsultationPaymentMethods"/>; needed when the fee is above 0).</summary>
public sealed record MarkAppointmentArrivedCommand(Guid AppointmentId, decimal Fee, string? PaymentMethod) : ICommand<AppointmentDto>;

/// <summary>The doctor saw the patient; <see cref="PrescriptionId"/> links the prescription written, if any.</summary>
public sealed record MarkAppointmentSeenCommand(Guid AppointmentId, Guid? PrescriptionId = null) : ICommand<AppointmentDto>;

public sealed record MarkAppointmentNoShowCommand(Guid AppointmentId) : ICommand<AppointmentDto>;

/// <summary>Cancels a booked or arrived token. A fee already taken is given back by the method it was paid with,
/// unless the doctor has already been paid for that visit.</summary>
public sealed record CancelAppointmentCommand(Guid AppointmentId, string Reason) : ICommand<AppointmentDto>;
