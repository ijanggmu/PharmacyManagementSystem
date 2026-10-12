using FluentValidation;
using FSH.Modules.Inventory.Contracts.Events;
using FSH.Modules.Purchasing.Contracts.v1.DirectGoodsReceipts;
using FSH.Modules.Purchasing.Services;

namespace FSH.Modules.Purchasing.Features.v1.DirectGoodsReceipts.CreateDirectGoodsReceipt;

public sealed class CreateDirectGoodsReceiptCommandValidator : AbstractValidator<CreateDirectGoodsReceiptCommand>
{
    public CreateDirectGoodsReceiptCommandValidator()
    {
        RuleFor(x => x.SupplierId).NotEmpty();
        RuleFor(x => x.ReceiptDateUtc).NotEmpty().Must(BusinessDateRules.IsValid).WithMessage(BusinessDateRules.Message);
        RuleFor(x => x.SupplierInvoiceNumber).MaximumLength(128);
        RuleFor(x => x.Lines).NotEmpty().WithMessage("A direct goods receipt must have at least one line.");
        RuleForEach(x => x.Lines).ChildRules(line =>
        {
            line.RuleFor(l => l.MedicineId).NotEmpty();
            line.RuleFor(l => l.BatchNo).NotEmpty().MaximumLength(64);
            // Zero is allowed through: the handler treats a zero-quantity/zero-value line as a
            // no-op skip (same leniency as postDirectInventorySupplierReceipts), not a rejection —
            // only a negative value is a hard validation error.
            line.RuleFor(l => l.Quantity).GreaterThanOrEqualTo(0m);
            line.RuleFor(l => l.UnitCostPrice).GreaterThanOrEqualTo(0m);
            line.RuleFor(l => l.VatAmount).GreaterThanOrEqualTo(0m);
            line.RuleFor(l => l.RackLocation).MaximumLength(64);
            line.RuleFor(l => l.SellingPrice).GreaterThanOrEqualTo(0m).When(l => l.SellingPrice is not null);
        });

        When(x => x.Payment is not null, () =>
        {
            RuleFor(x => x.Payment!.Method)
                .Must(SupplierPaymentMethods.IsKnown)
                .WithMessage("Choose how the supplier was paid (cash, bank, cheque, card, eSewa, Khalti or Fonepay).");
            RuleFor(x => x.Payment!.Reference).MaximumLength(200);
            RuleFor(x => x.Payment!.PaymentDateUtc!.Value)
                .Must(BusinessDateRules.IsValid)
                .When(x => x.Payment!.PaymentDateUtc is not null)
                .WithName("Payment.PaymentDateUtc")
                .WithMessage(BusinessDateRules.Message);
            RuleFor(x => x.Payment!.Amount).GreaterThan(0m).When(x => x.Payment!.Amount is not null);
            RuleFor(x => x)
                .Must(x => x.Payment!.Amount is null || x.Lines is null
                    || x.Payment.Amount <= x.Lines.Sum(l => (l.Quantity * l.UnitCostPrice) + l.VatAmount))
                .WithName("Payment.Amount")
                .WithMessage("The amount paid can't be more than the receipt total.");
        });
    }
}
