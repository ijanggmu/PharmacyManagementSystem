using FSH.Modules.Prescriptions.Contracts.Dtos;
using FSH.Modules.Prescriptions.Contracts.v1.Reports;
using FSH.Modules.Prescriptions.Data;
using FSH.Modules.Prescriptions.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Prescriptions.Features.v1.Reports.GetPrescriptionStats;

public sealed class GetPrescriptionStatsQueryHandler(PrescriptionsDbContext dbContext)
    : IQueryHandler<GetPrescriptionStatsQuery, PrescriptionStatsDto>
{
    public async ValueTask<PrescriptionStatsDto> Handle(GetPrescriptionStatsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var prescriptions = await dbContext.Prescriptions
            .AsNoTracking()
            .Include(p => p.Items)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        int total = prescriptions.Count;
        int cancelled = 0;
        int pending = 0;
        int partiallyFilled = 0;
        int filled = 0;

        foreach (var p in prescriptions)
        {
            if (p.Status == PrescriptionStatus.Cancelled)
            {
                cancelled++;
                continue;
            }

            switch (DeriveFillStatus(p))
            {
                case FillStatus.Filled:
                    filled++;
                    break;
                case FillStatus.PartiallyFilled:
                    partiallyFilled++;
                    break;
                default:
                    pending++;
                    break;
            }
        }

        return new PrescriptionStatsDto(total, pending, partiallyFilled, filled, cancelled);
    }

    /// <summary>
    /// This domain has no explicit "filled" status column (unlike the legacy schema) — fill state is
    /// derived from each item's dispensed vs. prescribed quantity. No items, or none dispensed yet, is
    /// Pending; every item fully dispensed is Filled; anything in between is PartiallyFilled.
    /// </summary>
    private static FillStatus DeriveFillStatus(Prescription prescription)
    {
        if (prescription.Items.Count == 0 || prescription.Items.All(i => i.DispensedQuantity == 0))
        {
            return FillStatus.Pending;
        }

        return prescription.Items.All(i => i.RemainingQuantity <= 0)
            ? FillStatus.Filled
            : FillStatus.PartiallyFilled;
    }

    private enum FillStatus
    {
        Pending,
        PartiallyFilled,
        Filled,
    }
}
