using FluentValidation;
using FSH.Modules.Inventory.Contracts.Events;
using FSH.Modules.Inventory.Contracts.v1.Medicines;

namespace FSH.Modules.Inventory.Features.v1.Medicines.CreateMedicine;

public sealed class CreateMedicineCommandValidator : AbstractValidator<CreateMedicineCommand>
{
    public CreateMedicineCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(256);
        RuleFor(x => x.GenericName).MaximumLength(256);
        RuleFor(x => x.ReorderLevel).GreaterThanOrEqualTo(0m);

        RuleFor(x => x.InitialStockQuantity).GreaterThanOrEqualTo(0m).When(x => x.InitialStockQuantity is not null);
        RuleFor(x => x.CostPrice).GreaterThanOrEqualTo(0m).When(x => x.CostPrice is not null);
        RuleFor(x => x.SellingPrice).GreaterThanOrEqualTo(0m).When(x => x.SellingPrice is not null);
        RuleFor(x => x.RackLocation).MaximumLength(64);

        RuleFor(x => x.UnitPrice).GreaterThanOrEqualTo(0m).When(x => x.UnitPrice is not null);
        RuleFor(x => x.Form).MaximumLength(64);
        RuleFor(x => x.Strength).MaximumLength(64);
        RuleFor(x => x.Barcode).MaximumLength(64);
        RuleFor(x => x.Description).MaximumLength(2000);
        RuleFor(x => x.MaximumStock).GreaterThanOrEqualTo(0m).When(x => x.MaximumStock is not null);

        RuleFor(x => x.BrandName).MaximumLength(200);
        RuleFor(x => x.Dosage).MaximumLength(200);
        RuleFor(x => x.SideEffects).MaximumLength(2000);
        RuleFor(x => x.StorageInstructions).MaximumLength(2000);
        RuleFor(x => x.StorageTempMinC).InclusiveBetween(-50m, 50m).When(x => x.StorageTempMinC is not null);
        RuleFor(x => x.StorageTempMaxC).InclusiveBetween(-50m, 50m).When(x => x.StorageTempMaxC is not null);
        RuleFor(x => x.UnitsPerPack).GreaterThanOrEqualTo(1).When(x => x.UnitsPerPack is not null);
        RuleFor(x => x.UnitLabel).MaximumLength(50);
        RuleFor(x => x.ControlledSchedule)
            .Must(s => s is null || s.Trim().Length <= 20)
            .WithMessage("Controlled schedule must be 20 characters or fewer.");
        RuleFor(x => x.SupplierInvoiceNumber).MaximumLength(100);
        RuleFor(x => x.VatAmount).GreaterThanOrEqualTo(0m).When(x => x.VatAmount is not null);

        // Mirrors medicine-service.ts's insertMedicineBatchRow: a missing batch number is generated and
        // a missing expiry is stored as non-expiring, so neither is required when seeding opening stock.
        RuleFor(x => x.BatchNumber).MaximumLength(64);

        When(x => x.Payment is not null, () =>
        {
            RuleFor(x => x.SupplierId).NotEmpty().WithMessage("Choose the supplier that was paid.");
            RuleFor(x => x.InitialStockQuantity).GreaterThan(0m).WithMessage("A paid bill needs opening stock.");
            RuleFor(x => x.Payment!.Method)
                .Must(SupplierPaymentMethods.IsKnown)
                .WithMessage("Choose how the supplier was paid (cash, bank, cheque, card, eSewa, Khalti or Fonepay).");
            RuleFor(x => x.Payment!.Reference).MaximumLength(200);
            RuleFor(x => x.Payment!.Amount).GreaterThan(0m).When(x => x.Payment!.Amount is not null);
            RuleFor(x => x)
                .Must(x => x.Payment!.Amount is null
                    || x.Payment.Amount <= ((x.InitialStockQuantity ?? 0m) * (x.CostPrice ?? 0m)) + (x.VatAmount ?? 0m))
                .WithName("Payment.Amount")
                .WithMessage("The amount paid can't be more than the bill total (quantity × cost + VAT).");
        });
    }
}
