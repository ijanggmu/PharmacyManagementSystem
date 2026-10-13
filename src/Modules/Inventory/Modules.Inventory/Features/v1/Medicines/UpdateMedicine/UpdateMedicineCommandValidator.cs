using FluentValidation;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Services;

namespace FSH.Modules.Inventory.Features.v1.Medicines.UpdateMedicine;

public sealed class UpdateMedicineCommandValidator : AbstractValidator<UpdateMedicineCommand>
{
    public UpdateMedicineCommandValidator()
    {
        RuleFor(x => x.MedicineId).NotEmpty();
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
        RuleFor(x => x.PriceChangeReason).MaximumLength(500);
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

        // Missing batch number / expiry get the legacy defaults in StockReceiptService, so neither is required.
        RuleFor(x => x.BatchNumber).MaximumLength(64);
        RuleFor(x => x.StockFunding).MustBeKnownStockFunding().MustNotBePaidWithSupplier(x => x.SupplierId);

        // Stock path 2 (target quantity). Reason is required with a target, mirroring the legacy
        // "a reason is required when manually decreasing stock" rule, applied to every adjustment.
        RuleFor(x => x.StockAdjustmentTargetQuantity)
            .GreaterThanOrEqualTo(0m)
            .When(x => x.StockAdjustmentTargetQuantity is not null);
        RuleFor(x => x.StockAdjustmentReason)
            .NotEmpty().MaximumLength(512)
            .When(x => x.StockAdjustmentTargetQuantity is not null);
        RuleFor(x => x)
            .Must(x => x.InitialStockQuantity is null || x.StockAdjustmentTargetQuantity is null)
            .WithMessage("Use either InitialStockQuantity (receive a lot) or StockAdjustmentTargetQuantity (set on-hand), not both.");
    }
}
