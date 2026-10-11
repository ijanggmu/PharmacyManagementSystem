using FSH.Framework.Core.Exceptions;
using FSH.Modules.Reference.Contracts.v1.Licenses;
using FSH.Modules.Reference.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Reference.Features.v1.Licenses.DeletePharmacyLicense;

public sealed class DeletePharmacyLicenseCommandHandler(ReferenceDbContext dbContext)
    : ICommandHandler<DeletePharmacyLicenseCommand, Guid>
{
    public async ValueTask<Guid> Handle(DeletePharmacyLicenseCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        var license = await dbContext.PharmacyLicenses
            .FirstOrDefaultAsync(l => l.Id == command.Id, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"License {command.Id} not found.");

        dbContext.PharmacyLicenses.Remove(license);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return license.Id;
    }
}
