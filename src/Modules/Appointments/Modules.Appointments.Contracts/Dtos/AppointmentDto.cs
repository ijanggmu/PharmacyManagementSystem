namespace FSH.Modules.Appointments.Contracts.Dtos;

public static class AppointmentStatuses
{
    public const string Booked = "Booked";
    public const string Arrived = "Arrived";
    public const string Seen = "Seen";
    public const string NoShow = "NoShow";
    public const string Cancelled = "Cancelled";
}

public static class AppointmentSources
{
    public const string Counter = "Counter";
    public const string Online = "Online";
}

/// <summary>How a consultation fee or a doctor payout can be paid. Same method names as sales, so Accounting maps
/// each to the tenant's cash, bank or wallet account.</summary>
public static class ConsultationPaymentMethods
{
    public const string Cash = "cash";
    public const string Card = "card";
    public const string Bank = "bank";
    public const string Esewa = "esewa";
    public const string Khalti = "khalti";
    public const string Fonepay = "fonepay";

    public static IReadOnlyList<string> All { get; } = [Cash, Card, Bank, Esewa, Khalti, Fonepay];

    public static bool IsKnown(string? method) => Normalize(method) is not null;

    /// <summary>The method's canonical (lower-case) name, matched ignoring case; null when it isn't one of <see cref="All"/>.</summary>
    public static string? Normalize(string? method) =>
        method is null ? null : All.FirstOrDefault(m => string.Equals(m, method.Trim(), StringComparison.OrdinalIgnoreCase));
}

public sealed record AppointmentDto(
    Guid Id,
    Guid SessionId,
    Guid DoctorId,
    string DoctorName,
    Guid BranchId,
    DateOnly Date,
    TimeOnly StartTime,
    TimeOnly EndTime,
    int TokenNo,
    Guid? CustomerId,
    string PatientName,
    string? PatientPhone,
    string Source,
    string Status,
    string? Note,
    DateTime BookedAtUtc,
    DateTime? ArrivedAtUtc,
    DateTime? SeenAtUtc,
    DateTime? CancelledAtUtc,
    string? CancelReason,
    decimal? FeeAmount,
    decimal? DoctorShareAmount,
    string? PaymentMethod,
    DateTime? FeePaidAtUtc,
    DateTime? FeeRefundedAtUtc,
    Guid? PayoutId,
    Guid? PrescriptionId);

/// <summary>Every sitting on one date, each with its tokens: the "today's appointments" sheet.</summary>
public sealed record DaySheetDto(DateOnly Date, IReadOnlyList<DaySheetSessionDto> Sessions, IReadOnlyList<TimetableDayOffDto> DaysOff);

public sealed record DaySheetSessionDto(
    Guid DoctorId,
    string DoctorName,
    string? Speciality,
    decimal Fee,
    Guid BranchId,
    DateOnly Date,
    TimeOnly StartTime,
    TimeOnly EndTime,
    int MaxTokens,
    int Booked,
    bool IsExtraDay,
    IReadOnlyList<AppointmentDto> Appointments,
    string? NmcNumber = null);
