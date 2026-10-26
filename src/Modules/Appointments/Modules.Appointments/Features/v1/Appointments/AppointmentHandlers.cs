using System.Diagnostics;
using FluentValidation;
using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Abstractions;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Appointments.Contracts.Dtos;
using FSH.Modules.Appointments.Contracts.Events;
using FSH.Modules.Appointments.Contracts.v1.Appointments;
using FSH.Modules.Appointments.Data;
using FSH.Modules.Appointments.Domain;
using FSH.Modules.Appointments.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Appointments.Features.v1.Appointments;

public sealed class BookTokenCommandHandler(
    AppointmentsDbContext dbContext, ICurrentUser currentUser, TimeProvider timeProvider)
    : ICommandHandler<BookTokenCommand, AppointmentDto>
{
    public async ValueTask<AppointmentDto> Handle(BookTokenCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        var (appointment, session, doctor) = await TokenBooking.BookAsync(
            dbContext,
            new TokenBooking.Request(
                command.DoctorId, command.Date, command.StartTime, command.PatientName, command.PatientPhone,
                command.CustomerId, AppointmentSource.Counter, command.Note,
                currentUser.IsAuthenticated() ? currentUser.GetUserId() : null),
            timeProvider,
            cancellationToken).ConfigureAwait(false);
        return AppointmentMapping.ToDto(appointment, session, doctor.Name);
    }
}

/// <summary>Marks the patient arrived and takes the fee. The doctor's part is worked out from the doctor's share as it
/// stands now and copied onto the visit; the fee's receipt goes to Accounting through the outbox in the same
/// transaction.</summary>
public sealed class MarkAppointmentArrivedCommandHandler(
    AppointmentsDbContext dbContext, IOutboxWriter outbox, ICurrentUser currentUser, TimeProvider timeProvider)
    : ICommandHandler<MarkAppointmentArrivedCommand, AppointmentDto>
{
    public async ValueTask<AppointmentDto> Handle(MarkAppointmentArrivedCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        return await AppointmentWrites.InTransactionAsync(dbContext, async ct =>
        {
            var appointment = await AppointmentWrites.LoadAsync(dbContext, command.AppointmentId, ct).ConfigureAwait(false);
            var doctor = await AppointmentReads.LoadDoctorAsync(dbContext, appointment.DoctorId, ct).ConfigureAwait(false);
            DateTime now = timeProvider.GetUtcNow().UtcDateTime;
            decimal fee = Math.Round(command.Fee, 2, MidpointRounding.AwayFromZero);
            appointment.MarkArrived(fee, Doctor.ShareOf(fee, doctor.ShareType, doctor.ShareValue), command.PaymentMethod, now);
            await SaveAsync(ct).ConfigureAwait(false);

            if (appointment.HasPaidFee)
            {
                await outbox.AddAsync(new ConsultationFeeCollectedIntegrationEvent(
                    Id: Guid.NewGuid(),
                    OccurredOnUtc: now,
                    TenantId: currentUser.GetTenant(),
                    CorrelationId: Activity.Current?.Id ?? Guid.NewGuid().ToString(),
                    Source: "Appointments",
                    AppointmentId: appointment.Id,
                    BranchId: appointment.BranchId,
                    DoctorName: doctor.Name,
                    PatientName: appointment.PatientName,
                    TokenNo: appointment.TokenNo,
                    Amount: appointment.FeeAmount!.Value,
                    DoctorShare: appointment.DoctorShareAmount ?? 0m,
                    PaymentMethod: appointment.PaymentMethod!,
                    PaidOnUtc: now), ct).ConfigureAwait(false);
            }

            return await AppointmentReads.ToDtoAsync(dbContext, appointment, ct).ConfigureAwait(false);
        }, cancellationToken).ConfigureAwait(false);
    }

    private async Task SaveAsync(CancellationToken ct)
    {
        try
        {
            await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);
        }
        catch (DbUpdateConcurrencyException ex)
        {
            throw AppointmentWrites.ChangedMeanwhile(ex);
        }
    }
}

public sealed class MarkAppointmentSeenCommandHandler(AppointmentsDbContext dbContext, TimeProvider timeProvider)
    : ICommandHandler<MarkAppointmentSeenCommand, AppointmentDto>
{
    public async ValueTask<AppointmentDto> Handle(MarkAppointmentSeenCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        var appointment = await AppointmentWrites.LoadAsync(dbContext, command.AppointmentId, cancellationToken).ConfigureAwait(false);
        appointment.MarkSeen(command.PrescriptionId, timeProvider.GetUtcNow().UtcDateTime);
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (DbUpdateConcurrencyException ex)
        {
            throw AppointmentWrites.ChangedMeanwhile(ex);
        }

        return await AppointmentReads.ToDtoAsync(dbContext, appointment, cancellationToken).ConfigureAwait(false);
    }
}

public sealed class MarkAppointmentNoShowCommandHandler(AppointmentsDbContext dbContext, TimeProvider timeProvider)
    : ICommandHandler<MarkAppointmentNoShowCommand, AppointmentDto>
{
    public async ValueTask<AppointmentDto> Handle(MarkAppointmentNoShowCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        var appointment = await AppointmentWrites.LoadAsync(dbContext, command.AppointmentId, cancellationToken).ConfigureAwait(false);
        appointment.MarkNoShow(timeProvider.GetUtcNow().UtcDateTime);
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (DbUpdateConcurrencyException ex)
        {
            throw AppointmentWrites.ChangedMeanwhile(ex);
        }

        return await AppointmentReads.ToDtoAsync(dbContext, appointment, cancellationToken).ConfigureAwait(false);
    }
}

/// <summary>Cancels the token and frees its place in the sitting. A fee taken is given back: Accounting reverses its
/// receipt. Retries when a counter booking into the same sitting changed it at the same moment.</summary>
public sealed class CancelAppointmentCommandHandler(
    AppointmentsDbContext dbContext, IOutboxWriter outbox, ICurrentUser currentUser, TimeProvider timeProvider)
    : ICommandHandler<CancelAppointmentCommand, AppointmentDto>
{
    private const int MaxAttempts = 3;

    public async ValueTask<AppointmentDto> Handle(CancelAppointmentCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        for (int attempt = 1; attempt <= MaxAttempts; attempt++)
        {
            try
            {
                return await AppointmentWrites.InTransactionAsync(dbContext, ct => CancelOnceAsync(command, ct), cancellationToken)
                    .ConfigureAwait(false);
            }
            catch (DbUpdateConcurrencyException) when (attempt < MaxAttempts)
            {
                dbContext.ChangeTracker.Clear();
            }
            catch (DbUpdateConcurrencyException ex)
            {
                throw AppointmentWrites.ChangedMeanwhile(ex);
            }
        }

        throw AppointmentWrites.Conflict("Someone else changed this token at the same time. Reload and try again.");
    }

    private async ValueTask<AppointmentDto> CancelOnceAsync(CancelAppointmentCommand command, CancellationToken ct)
    {
        var appointment = await AppointmentWrites.LoadAsync(dbContext, command.AppointmentId, ct).ConfigureAwait(false);
        var session = await dbContext.DoctorSessions.FirstAsync(s => s.Id == appointment.SessionId, ct).ConfigureAwait(false);
        DateTime now = timeProvider.GetUtcNow().UtcDateTime;
        bool refund = appointment.Cancel(command.Reason, now);
        session.ReleasePlace();
        await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);

        if (refund)
        {
            await outbox.AddAsync(new ConsultationFeeRefundedIntegrationEvent(
                Id: Guid.NewGuid(),
                OccurredOnUtc: now,
                TenantId: currentUser.GetTenant(),
                CorrelationId: Activity.Current?.Id ?? Guid.NewGuid().ToString(),
                Source: "Appointments",
                AppointmentId: appointment.Id,
                BranchId: appointment.BranchId,
                Reason: appointment.CancelReason!,
                RefundedOnUtc: now), ct).ConfigureAwait(false);
        }

        return await AppointmentReads.ToDtoAsync(dbContext, appointment, ct).ConfigureAwait(false);
    }
}

public sealed class GetAppointmentByIdQueryHandler(AppointmentsDbContext dbContext)
    : IQueryHandler<GetAppointmentByIdQuery, AppointmentDto>
{
    public async ValueTask<AppointmentDto> Handle(GetAppointmentByIdQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        var appointment = await dbContext.Appointments.AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == query.AppointmentId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new FSH.Framework.Core.Exceptions.NotFoundException($"Appointment {query.AppointmentId} not found.");
        return await AppointmentReads.ToDtoAsync(dbContext, appointment, cancellationToken).ConfigureAwait(false);
    }
}

/// <summary>Every sitting on one date (timetable sittings plus saved ones that still have patients), each with its
/// tokens in token order.</summary>
public sealed class GetDaySheetQueryHandler(AppointmentsDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetDaySheetQuery, DaySheetDto>
{
    public async ValueTask<DaySheetDto> Handle(GetDaySheetQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        Guid? branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);
        var (timetable, doctors, saved) = await SittingBoard
            .BuildAsync(dbContext, query.Date, query.Date, branchId, null, cancellationToken)
            .ConfigureAwait(false);

        var sessionIds = saved.Select(s => s.Id).ToList();
        var appointments = await dbContext.Appointments.AsNoTracking()
            .Where(a => sessionIds.Contains(a.SessionId))
            .OrderBy(a => a.TokenNo)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        var dtos = await AppointmentReads.ToDtosAsync(dbContext, appointments, cancellationToken).ConfigureAwait(false);
        var savedByKey = saved.ToDictionary(s => (s.DoctorId, s.Date, s.StartTime));

        var sessions = timetable.Sessions.Select(s =>
        {
            var tokens = savedByKey.TryGetValue((s.DoctorId, s.Date, s.StartTime), out var session)
                ? dtos.Where(a => a.SessionId == session.Id).ToList()
                : [];
            var doctor = doctors.GetValueOrDefault(s.DoctorId);
            return new DaySheetSessionDto(
                s.DoctorId, s.DoctorName, s.Speciality, doctor?.Fee ?? 0m, s.BranchId, s.Date,
                s.StartTime, s.EndTime, s.MaxTokens, s.Booked, s.IsExtraDay, tokens, doctor?.NmcNumber);
        }).ToList();

        return new DaySheetDto(query.Date, sessions, timetable.DaysOff);
    }
}

public sealed class SearchAppointmentsQueryHandler(AppointmentsDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<SearchAppointmentsQuery, PagedResponse<AppointmentDto>>
{
    public async ValueTask<PagedResponse<AppointmentDto>> Handle(SearchAppointmentsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 50 : query.PageSize;

        var q = dbContext.Appointments.AsNoTracking().AsQueryable();
        if (await currentBranch.GetListFilterBranchIdAsync(cancellationToken).ConfigureAwait(false) is { } branchId)
        {
            q = q.Where(a => a.BranchId == branchId);
        }

        if (query.DoctorId is { } doctorId)
        {
            q = q.Where(a => a.DoctorId == doctorId);
        }

        if (!string.IsNullOrWhiteSpace(query.Status) && Enum.TryParse<AppointmentStatus>(query.Status, true, out var status))
        {
            q = q.Where(a => a.Status == status);
        }

        if (query.DateFrom is { } from)
        {
            q = q.Where(a => a.Date >= from);
        }

        if (query.DateTo is { } to)
        {
            q = q.Where(a => a.Date <= to);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            // Upper-cased Contains, as in SearchDoctorsQueryHandler.
            string upper = query.Search.Trim().ToUpperInvariant();
#pragma warning disable CA1304, CA1311, CA1862
            q = q.Where(a => a.PatientName.ToUpper().Contains(upper) || (a.PatientPhone != null && a.PatientPhone.Contains(upper)));
#pragma warning restore CA1304, CA1311, CA1862
        }

        q = q.OrderByDescending(a => a.Date).ThenBy(a => a.TokenNo);
        long total = await q.LongCountAsync(cancellationToken).ConfigureAwait(false);
        var items = await q.Skip((page - 1) * size).Take(size).ToListAsync(cancellationToken).ConfigureAwait(false);

        return new PagedResponse<AppointmentDto>
        {
            Items = await AppointmentReads.ToDtosAsync(dbContext, items, cancellationToken).ConfigureAwait(false),
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size),
        };
    }
}

/// <summary>Cash the doctors' desk moved through a branch drawer in a window: fees taken in cash, less cash fees given
/// back and doctors paid in cash at that branch.</summary>
public sealed class GetAppointmentDrawerCashQueryHandler(AppointmentsDbContext dbContext)
    : IQueryHandler<GetAppointmentDrawerCashQuery, decimal>
{
    public async ValueTask<decimal> Handle(GetAppointmentDrawerCashQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        const string cash = ConsultationPaymentMethods.Cash;

        decimal feesIn = await dbContext.Appointments.AsNoTracking()
            .Where(a => a.BranchId == query.BranchId && a.PaymentMethod == cash
                && a.FeePaidAtUtc >= query.FromUtc && a.FeePaidAtUtc <= query.ToUtc)
            .SumAsync(a => a.FeeAmount ?? 0m, cancellationToken)
            .ConfigureAwait(false);
        decimal feesBack = await dbContext.Appointments.AsNoTracking()
            .Where(a => a.BranchId == query.BranchId && a.PaymentMethod == cash
                && a.FeeRefundedAtUtc >= query.FromUtc && a.FeeRefundedAtUtc <= query.ToUtc)
            .SumAsync(a => a.FeeAmount ?? 0m, cancellationToken)
            .ConfigureAwait(false);
        decimal paidOut = await dbContext.DoctorPayouts.AsNoTracking()
            .Where(p => p.BranchId == query.BranchId && p.PaymentMethod == cash
                && p.PaidAtUtc >= query.FromUtc && p.PaidAtUtc <= query.ToUtc)
            .SumAsync(p => p.Amount, cancellationToken)
            .ConfigureAwait(false);

        return feesIn - feesBack - paidOut;
    }
}

public sealed class BookTokenCommandValidator : AbstractValidator<BookTokenCommand>
{
    public BookTokenCommandValidator()
    {
        RuleFor(x => x.DoctorId).NotEmpty();
        RuleFor(x => x.Date).NotEmpty();
        RuleFor(x => x.PatientName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.PatientPhone).MaximumLength(32);
        RuleFor(x => x.Note).MaximumLength(500);
    }
}

public sealed class MarkAppointmentArrivedCommandValidator : AbstractValidator<MarkAppointmentArrivedCommand>
{
    public MarkAppointmentArrivedCommandValidator()
    {
        RuleFor(x => x.AppointmentId).NotEmpty();
        RuleFor(x => x.Fee).InclusiveBetween(0, 1_000_000);
        RuleFor(x => x.PaymentMethod)
            .Must(ConsultationPaymentMethods.IsKnown)
            .When(x => x.Fee > 0)
            .WithMessage("Pick how the patient paid: cash, card, bank, eSewa, Khalti or Fonepay.");
    }
}

public sealed class MarkAppointmentSeenCommandValidator : AbstractValidator<MarkAppointmentSeenCommand>
{
    public MarkAppointmentSeenCommandValidator() => RuleFor(x => x.AppointmentId).NotEmpty();
}

public sealed class MarkAppointmentNoShowCommandValidator : AbstractValidator<MarkAppointmentNoShowCommand>
{
    public MarkAppointmentNoShowCommandValidator() => RuleFor(x => x.AppointmentId).NotEmpty();
}

public sealed class CancelAppointmentCommandValidator : AbstractValidator<CancelAppointmentCommand>
{
    public CancelAppointmentCommandValidator()
    {
        RuleFor(x => x.AppointmentId).NotEmpty();
        RuleFor(x => x.Reason).NotEmpty().MaximumLength(256);
    }
}

public sealed class SearchAppointmentsQueryValidator : AbstractValidator<SearchAppointmentsQuery>
{
    public SearchAppointmentsQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
        RuleFor(x => x.Search).MaximumLength(200);
        RuleFor(x => x.DateTo)
            .GreaterThanOrEqualTo(x => x.DateFrom)
            .When(x => x.DateFrom.HasValue && x.DateTo.HasValue)
            .WithMessage("DateTo must be on or after DateFrom.");
    }
}

public sealed class GetDaySheetQueryValidator : AbstractValidator<GetDaySheetQuery>
{
    public GetDaySheetQueryValidator() => RuleFor(x => x.Date).NotEmpty();
}
