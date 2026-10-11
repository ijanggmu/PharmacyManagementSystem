using FluentValidation;
using FSH.Modules.Inventory.Contracts.Events;
using FSH.Modules.Inventory.Contracts.v1.Medicines;

namespace FSH.Modules.Inventory.Features.v1.Medicines.AddMedicineStock;

public sealed class AddMedicineStockCommandValidator : AbstractValidator<AddMedicineStockCommand>
{
    public AddMedicineStockCommandValidator()
    {
        RuleFor(x => x.MedicineId).NotEmpty();
        RuleFor(x => x.Quantity).GreaterThan(0m);
        RuleFor(x => x.BatchNumber).MaximumLength(64);
        RuleFor(x => x.RackLocation).MaximumLength(64);
        RuleFor(x => x.CostPrice).GreaterThanOrEqualTo(0m).When(x => x.CostPrice is not null);
        RuleFor(x => x.SellingPrice).GreaterThanOrEqualTo(0m).When(x => x.SellingPrice is not null);
        RuleFor(x => x.SupplierInvoiceNumber).MaximumLength(100);
        RuleFor(x => x.VatAmount).GreaterThanOrEqualTo(0m).When(x => x.VatAmount is not null);

        // Same bill-payment rules as opening stock on CreateMedicineCommandValidator.
        When(x => x.Payment is not null, () =>
        {
            RuleFor(x => x.SupplierId).NotEmpty().WithMessage("Choose the supplier that was paid.");
            RuleFor(x => x.Payment!.Method)
                .Must(SupplierPaymentMethods.IsKnown)
                .WithMessage("Choose how the supplier was paid (cash, bank, cheque, card, eSewa, Khalti or Fonepay).");
            RuleFor(x => x.Payment!.Reference).MaximumLength(200);
            RuleFor(x => x.Payment!.Amount).GreaterThan(0m).When(x => x.Payment!.Amount is not null);
            RuleFor(x => x)
                .Must(x => x.Payment!.Amount is null
                    || x.Payment.Amount <= (x.Quantity * (x.CostPrice ?? 0m)) + (x.VatAmount ?? 0m))
                .WithName("Payment.Amount")
                .WithMessage("The amount paid can't be more than the bill total (quantity × cost + VAT).");
        });
    }
}
