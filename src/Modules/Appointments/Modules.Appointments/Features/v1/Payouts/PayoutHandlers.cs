using System.Diagnostics;
using FluentValidation;
using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Abstractions;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Appointments.Contracts.Dtos;
using FSH.Modules.Appointments.Contracts.Events;
using FSH.Modules.Appointments.Contracts.v1.Payouts;
using FSH.Modules.Appointments.Data;
using FSH.Modules.Appointments.Domain;
using FSH.Modules.Appointments.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Appointments.Features.v1.Payouts;

internal static class OwedVisits
{
    /// <summary>The doctor's visits whose fee was taken, not given back, and not yet paid out.</summary>
    public static IQueryable<Appointment> Of(AppointmentsDbContext dbContext, Guid doctorId) =>
        dbContext.Appointments.Where(a =>
            a.DoctorId == doctorId
            && a.FeePaidAtUtc != null
            && a.FeeRefundedAtUtc == null
            && a.FeeAmount > 0
            && a.Status != AppointmentStatus.Cancelled
            && a.PayoutId == null);
}

public sealed class GetDoctorBalanceQueryHandler(AppointmentsDbContext dbContext)
    : IQueryHandler<GetDoctorBalanceQuery, DoctorBalanceDto>
{
    public async ValueTask<DoctorBalanceDto> Handle(GetDoctorBalanceQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        var doctor = await AppointmentReads.LoadDoctorAsync(dbContext, query.DoctorId, cancellationToken).ConfigureAwait(false);
        var visits = await OwedVisits.Of(dbContext, query.DoctorId).AsNoTracking()
            .Select(a => new { a.Date, a.FeeAmount, a.DoctorShareAmount })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return new DoctorBalanceDto(
            doctor.Id,
            doctor.Name,
            visits.Sum(v => v.DoctorShareAmount ?? 0m),
            visits.Count,
            visits.Sum(v => v.FeeAmount ?? 0m),
            visits.Count == 0 ? null : visits.Min(v => v.Date));
    }
}

/// <summary>Pays the doctor everything owed now. The payout and the visits it settles save together with the
/// payment's outbox event; two people paying the same doctor at once collide on the visits' row versions.</summary>
public sealed class PayDoctorCommandHandler(
    AppointmentsDbContext dbContext,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    TimeProvider timeProvider) : ICommandHandler<PayDoctorCommand, DoctorPayoutDto>
{
    public async ValueTask<DoctorPayoutDto> Handle(PayDoctorCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        Guid? branchId = await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);

        return await AppointmentWrites.InTransactionAsync(dbContext, async ct =>
        {
            var doctor = await AppointmentReads.LoadDoctorAsync(dbContext, command.DoctorId, ct).ConfigureAwait(false);
            var visits = await OwedVisits.Of(dbContext, command.DoctorId).ToListAsync(ct).ConfigureAwait(false);
            DateTime now = timeProvider.GetUtcNow().UtcDateTime;
            var payout = DoctorPayout.Pay(
                doctor.Id, visits, command.PaymentMethod, command.Note, branchId, now,
                currentUser.IsAuthenticated() ? currentUser.GetUserId() : null, currentUser.Name);
            dbContext.DoctorPayouts.Add(payout);
            try
            {
                await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);
            }
            catch (DbUpdateConcurrencyException ex)
            {
                throw AppointmentWrites.Conflict("This doctor was just paid by someone else. Reload to see what is owed now.", ex);
            }

            await outbox.AddAsync(new DoctorPayoutPaidIntegrationEvent(
                Id: Guid.NewGuid(),
                OccurredOnUtc: now,
                TenantId: currentUser.GetTenant(),
                CorrelationId: Activity.Current?.Id ?? Guid.NewGuid().ToString(),
                Source: "Appointments",
                PayoutId: payout.Id,
                BranchId: payout.BranchId,
                DoctorName: doctor.Name,
                Amount: payout.Amount,
                PaymentMethod: payout.PaymentMethod,
                PaidOnUtc: now), ct).ConfigureAwait(false);

            return AppointmentMapping.ToDto(payout, doctor.Name);
        }, cancellationToken).ConfigureAwait(false);
    }
}

public sealed class SearchDoctorPayoutsQueryHandler(AppointmentsDbContext dbContext)
    : IQueryHandler<SearchDoctorPayoutsQuery, PagedResponse<DoctorPayoutDto>>
{
    public async ValueTask<PagedResponse<DoctorPayoutDto>> Handle(SearchDoctorPayoutsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 50 : query.PageSize;

        var q = dbContext.DoctorPayouts.AsNoTracking().AsQueryable();
        if (query.DoctorId is { } doctorId)
        {
            q = q.Where(p => p.DoctorId == doctorId);
        }

        q = q.OrderByDescending(p => p.PaidAtUtc);
        long total = await q.LongCountAsync(cancellationToken).ConfigureAwait(false);
        var items = await q.Skip((page - 1) * size).Take(size).ToListAsync(cancellationToken).ConfigureAwait(false);
        var doctorIds = items.Select(p => p.DoctorId).Distinct().ToList();
        var names = await dbContext.Doctors.AsNoTracking()
            .Where(d => doctorIds.Contains(d.Id))
            .ToDictionaryAsync(d => d.Id, d => d.Name, cancellationToken)
            .ConfigureAwait(false);

        return new PagedResponse<DoctorPayoutDto>
        {
            Items = items.Select(p => AppointmentMapping.ToDto(p, names.GetValueOrDefault(p.DoctorId, "Doctor"))).ToList(),
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size),
        };
    }
}

public sealed class PayDoctorCommandValidator : AbstractValidator<PayDoctorCommand>
{
    public PayDoctorCommandValidator()
    {
        RuleFor(x => x.DoctorId).NotEmpty();
        RuleFor(x => x.PaymentMethod)
            .Must(ConsultationPaymentMethods.IsKnown)
            .WithMessage("Pick how the doctor is paid: cash, bank, eSewa, Khalti, Fonepay or card.");
        RuleFor(x => x.Note).MaximumLength(500);
    }
}

public sealed class SearchDoctorPayoutsQueryValidator : AbstractValidator<SearchDoctorPayoutsQuery>
{
    public SearchDoctorPayoutsQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
    }
}
