using FSH.Framework.Core.Exceptions;
using FSH.Modules.Prescriptions.Contracts.Dtos;
using FSH.Modules.Prescriptions.Contracts.v1.Refills;
using FSH.Modules.Prescriptions.Data;
using FSH.Modules.Prescriptions.Features.v1.Refills.SearchPrescriptionRefills;
using FSH.Modules.Prescriptions.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Prescriptions.Features.v1.Refills.GetPrescriptionRefillById;

public sealed class GetPrescriptionRefillByIdQueryHandler(PrescriptionsDbContext dbContext, PrescriptionNameResolver nameResolver)
    : IQueryHandler<GetPrescriptionRefillByIdQuery, PrescriptionRefillDto>
{
    public async ValueTask<PrescriptionRefillDto> Handle(GetPrescriptionRefillByIdQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var refill = await dbContext.PrescriptionRefills
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.Id == query.RefillId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Prescription refill {query.RefillId} not found.");

        var prescription = await dbContext.Prescriptions
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == refill.PrescriptionId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Prescription {refill.PrescriptionId} not found.");

        var names = await nameResolver.ResolveAsync([prescription], cancellationToken).ConfigureAwait(false);
        return SearchPrescriptionRefillsQueryHandler.ToDto(refill, prescription, names);
    }
}
