using FSH.Framework.Core.Exceptions;
using FSH.Modules.Reference.Contracts.v1.Licenses;
using FSH.Modules.Reference.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Reference.Features.v1.Licenses.UpdatePharmacyLicense;

public sealed class UpdatePharmacyLicenseCommandHandler(ReferenceDbContext dbContext)
    : ICommandHandler<UpdatePharmacyLicenseCommand, Guid>
{
    public async ValueTask<Guid> Handle(UpdatePharmacyLicenseCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        var license = await dbContext.PharmacyLicenses
            .FirstOrDefaultAsync(l => l.Id == command.Id, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"License {command.Id} not found.");

        license.Update(command.LicenseType, command.Number, command.ExpiresOn, command.Title, command.HolderName, command.IssuedOn, command.Notes);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return license.Id;
    }
}
