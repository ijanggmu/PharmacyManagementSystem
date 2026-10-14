using FSH.Framework.Core.Exceptions;
using FSH.Modules.Prescriptions.Contracts.Dtos;
using FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;
using FSH.Modules.Prescriptions.Data;
using FSH.Modules.Prescriptions.Domain;
using FSH.Modules.Prescriptions.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Prescriptions.Features.v1.Prescriptions.GetPrescriptionById;

public sealed class GetPrescriptionByIdQueryHandler(PrescriptionsDbContext dbContext, PrescriptionNameResolver nameResolver)
    : IQueryHandler<GetPrescriptionByIdQuery, PrescriptionDto>
{
    public async ValueTask<PrescriptionDto> Handle(GetPrescriptionByIdQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var p = await dbContext.Prescriptions
            .AsNoTracking()
            .Include(p => p.Items)
            .FirstOrDefaultAsync(p => p.Id == query.PrescriptionId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Prescription {query.PrescriptionId} not found.");

        var names = await nameResolver.ResolveAsync([p], cancellationToken).ConfigureAwait(false);
        return ToDto(p, names);
    }

    internal static PrescriptionDto ToDto(Prescription p, PrescriptionNames names)
    {
        var items = p.Items
            .Select(i => new PrescriptionItemDto(
                i.Id, i.MedicineId, names.MedicineName(i.MedicineId), i.PrescribedQuantity, i.DispensedQuantity,
                i.RefillsAllowed, i.FillsUsed, i.DosageInstructions,
                i.FillsAllowed, i.RemainingInCurrentFill, i.RemainingQuantity, i.TotalAuthorizedQuantity))
            .ToList();

        return new PrescriptionDto(
            p.Id, p.CustomerId, names.CustomerName(p.CustomerId), p.DoctorName, p.PrescriptionDate, p.ExpiryDate,
            p.Status.ToString(), p.CreatedAtUtc, p.CancelledAtUtc, p.CancelReason, items, p.CreatedByUserId, p.Notes,
            p.PrescriptionNumber);
    }
}
