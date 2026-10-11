using FSH.Modules.Reference.Contracts.Dtos;
using FSH.Modules.Reference.Contracts.v1.Licenses;
using FSH.Modules.Reference.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Reference.Features.v1.Licenses.ListPharmacyLicenses;

public sealed class ListPharmacyLicensesQueryHandler(ReferenceDbContext dbContext)
    : IQueryHandler<ListPharmacyLicensesQuery, List<PharmacyLicenseDto>>
{
    public async ValueTask<List<PharmacyLicenseDto>> Handle(ListPharmacyLicensesQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        var today = PharmacyLicenseMapper.NepalToday(DateTime.UtcNow);
        var licenses = await dbContext.PharmacyLicenses.AsNoTracking()
            .OrderBy(l => l.ExpiresOn)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        return licenses.Select(l => l.ToDto(today)).ToList();
    }
}
