using FSH.Framework.Core.Exceptions;
using FSH.Modules.Reference.Contracts.v1.Settings;
using FSH.Modules.Reference.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Reference.Features.v1.Settings.UpdatePharmacySettings;

public sealed class UpdatePharmacySettingsCommandHandler(ReferenceDbContext dbContext)
    : ICommandHandler<UpdatePharmacySettingsCommand, Guid>
{
    public async ValueTask<Guid> Handle(UpdatePharmacySettingsCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var settings = await dbContext.PharmacySettings
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException("Pharmacy settings have not been initialized for this tenant.");

        settings.Update(
            command.BusinessName,
            command.BusinessAddress,
            command.BusinessPhone,
            command.BusinessEmail,
            command.CurrencyCode,
            command.VatRatePercent,
            command.InvoiceNumberPrefix);

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return settings.Id;
    }
}
