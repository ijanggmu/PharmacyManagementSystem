using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Persistence;
using FSH.Modules.Prescriptions.Contracts.Dtos;
using FSH.Modules.Prescriptions.Contracts.v1.Refills;
using FSH.Modules.Prescriptions.Data;
using FSH.Modules.Prescriptions.Domain;
using FSH.Modules.Prescriptions.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Prescriptions.Features.v1.Refills.CreatePrescriptionRefill;

/// <summary>
/// Records a fill/refill against a prescription item through <see cref="Prescription.RecordRefill"/> — the
/// same domain safety rule (<see cref="PrescriptionItem.RecordDispense"/>, plus the expiry/cancellation check)
/// that <c>DispensingSafetyPolicy</c> runs for a sale-driven dispense. Not routed through
/// <c>IDispensingSafetyPolicy.RecordDispenseAsync</c> directly: that method only acts on lines the controlled-
/// medicine checker flags as controlled/prescription-required (a sale-specific gate), while a direct refill
/// request already names the prescription item to dispense against regardless of that flag.
/// </summary>
public sealed class CreatePrescriptionRefillCommandHandler(
    PrescriptionsDbContext dbContext,
    ICurrentUser currentUser,
    TimeProvider timeProvider,
    PrescriptionNameResolver nameResolver,
    AmbientDbTransactionRegistry ambientTransactions)
    : ICommandHandler<CreatePrescriptionRefillCommand, PrescriptionRefillDto>
{
    public async ValueTask<PrescriptionRefillDto> Handle(CreatePrescriptionRefillCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        Prescription? prescription = null;
        PrescriptionRefill? refill = null;

        // Locked like a sale-driven dispense, so a direct refill and a sale against the same item can't both
        // pass the remaining-quantity / fills check on the same stale values.
        await PrescriptionWrites.RunInTransactionAsync(dbContext, ambientTransactions, async ct =>
        {
            dbContext.ChangeTracker.Clear();
            await PrescriptionWrites.LockItemsAsync(dbContext, [command.PrescriptionId], ct).ConfigureAwait(false);

            prescription = await dbContext.Prescriptions
                .Include(p => p.Items)
                .FirstOrDefaultAsync(p => p.Id == command.PrescriptionId, ct)
                .ConfigureAwait(false)
                ?? throw new NotFoundException($"Prescription {command.PrescriptionId} not found.");

            var now = timeProvider.GetUtcNow();
            var today = NepalClock.DateOf(now.UtcDateTime);

            // GetUserId returns Guid.Empty when there is no authenticated user; store null instead.
            var userId = currentUser.GetUserId();
            Guid? dispensedByUserId = userId == Guid.Empty ? null : userId;

            refill = prescription.RecordRefill(
                command.MedicineId, command.QuantityDispensed, today, now.UtcDateTime, dispensedByUserId, command.Notes);

            await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);
        }, cancellationToken).ConfigureAwait(false);

        var names = await nameResolver.ResolveAsync([prescription!], cancellationToken).ConfigureAwait(false);
        return ToDto(prescription!, refill!, names);
    }

    internal static PrescriptionRefillDto ToDto(Prescription prescription, PrescriptionRefill refill, PrescriptionNames names) =>
        new(
            refill.Id,
            prescription.Id,
            prescription.PrescriptionNumber,
            prescription.CustomerId,
            names.CustomerName(prescription.CustomerId),
            refill.PrescriptionItemId,
            refill.MedicineId,
            names.MedicineName(refill.MedicineId),
            refill.QuantityDispensed,
            refill.RefilledAtUtc,
            refill.DispensedByUserId,
            refill.Notes);
}
