using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Services;
using Mediator;

namespace FSH.Modules.Inventory.Features.v1.Medicines.GenerateMedicineBarcode;

/// <summary>
/// Proposes an unused in-store EAN-13 for a medicine without a manufacturer barcode. Nothing is
/// reserved: the form saves it with the medicine, where the unique check runs again.
/// </summary>
public sealed class GenerateMedicineBarcodeQueryHandler(InventoryDbContext dbContext)
    : IQueryHandler<GenerateMedicineBarcodeQuery, GeneratedBarcodeDto>
{
    public async ValueTask<GeneratedBarcodeDto> Handle(GenerateMedicineBarcodeQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        string barcode = await MedicineIdentityGuard.NewUnusedBarcodeAsync(dbContext, cancellationToken).ConfigureAwait(false);
        return new GeneratedBarcodeDto(barcode);
    }
}
