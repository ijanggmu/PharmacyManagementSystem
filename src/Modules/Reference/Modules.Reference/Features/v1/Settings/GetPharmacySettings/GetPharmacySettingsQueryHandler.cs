using FSH.Framework.Core.Exceptions;
using FSH.Modules.Reference.Contracts.Dtos;
using FSH.Modules.Reference.Contracts.v1.Settings;
using FSH.Modules.Reference.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Reference.Features.v1.Settings.GetPharmacySettings;

public sealed class GetPharmacySettingsQueryHandler(ReferenceDbContext dbContext)
    : IQueryHandler<GetPharmacySettingsQuery, PharmacySettingsDto>
{
    public async ValueTask<PharmacySettingsDto> Handle(GetPharmacySettingsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var s = await dbContext.PharmacySettings
            .AsNoTracking()
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException("Pharmacy settings have not been initialized for this tenant.");

        return new PharmacySettingsDto(
            s.Id, s.BusinessName, s.BusinessAddress, s.BusinessPhone, s.BusinessEmail,
            s.CurrencyCode, s.VatRatePercent, s.InvoiceNumberPrefix, s.NextInvoiceSequence, s.UpdatedAtUtc);
    }
}
