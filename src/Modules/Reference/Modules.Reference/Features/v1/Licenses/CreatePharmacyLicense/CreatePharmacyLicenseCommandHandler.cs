using FSH.Modules.Reference.Contracts.v1.Licenses;
using FSH.Modules.Reference.Data;
using FSH.Modules.Reference.Domain;
using Mediator;

namespace FSH.Modules.Reference.Features.v1.Licenses.CreatePharmacyLicense;

public sealed class CreatePharmacyLicenseCommandHandler(ReferenceDbContext dbContext)
    : ICommandHandler<CreatePharmacyLicenseCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreatePharmacyLicenseCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        var license = PharmacyLicense.Create(
            command.LicenseType, command.Number, command.ExpiresOn, command.Title, command.HolderName, command.IssuedOn, command.Notes);
        dbContext.PharmacyLicenses.Add(license);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return license.Id;
    }
}
