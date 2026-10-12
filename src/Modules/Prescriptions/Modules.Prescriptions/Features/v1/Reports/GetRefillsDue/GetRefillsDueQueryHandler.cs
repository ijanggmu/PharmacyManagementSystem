using FSH.Modules.Prescriptions.Contracts.Dtos;
using FSH.Modules.Prescriptions.Contracts.v1.Reports;
using FSH.Modules.Prescriptions.Data;
using FSH.Modules.Prescriptions.Domain;
using FSH.Modules.Prescriptions.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Prescriptions.Features.v1.Reports.GetRefillsDue;

public sealed class GetRefillsDueQueryHandler(PrescriptionsDbContext dbContext, TimeProvider timeProvider)
    : IQueryHandler<GetRefillsDueQuery, IReadOnlyList<RefillDueDto>>
{
    public async ValueTask<IReadOnlyList<RefillDueDto>> Handle(GetRefillsDueQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var today = NepalClock.Today(timeProvider);
        var horizon = today.AddDays(query.WithinDays);

        var prescriptions = await dbContext.Prescriptions
            .AsNoTracking()
            .Include(p => p.Items)
            .Where(p => p.Status == PrescriptionStatus.Active && p.ExpiryDate <= horizon && p.ExpiryDate >= today)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return prescriptions
            .SelectMany(p => p.Items
                .Where(i => i.RefillsUsed < i.RefillsAllowed + 1 && i.RemainingQuantity > 0)
                .Select(i => new RefillDueDto(
                    p.Id, p.CustomerId, null, i.MedicineId, null,
                    i.RefillsAllowed, i.RefillsUsed, i.RefillsAllowed + 1 - i.RefillsUsed, p.ExpiryDate)))
            .OrderBy(r => r.ExpiryDate)
            .ToList();
    }
}
