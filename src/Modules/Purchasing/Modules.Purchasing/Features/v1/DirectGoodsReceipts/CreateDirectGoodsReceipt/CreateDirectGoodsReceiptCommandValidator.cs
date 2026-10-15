using FluentValidation;
using FSH.Modules.Inventory.Contracts.Events;
using FSH.Modules.Purchasing.Contracts.v1.DirectGoodsReceipts;
using FSH.Modules.Purchasing.Domain;
using FSH.Modules.Purchasing.Services;

namespace FSH.Modules.Purchasing.Features.v1.DirectGoodsReceipts.CreateDirectGoodsReceipt;

public sealed class CreateDirectGoodsReceiptCommandValidator : AbstractValidator<CreateDirectGoodsReceiptCommand>
{
    public CreateDirectGoodsReceiptCommandValidator()
    {
        RuleFor(x => x.SupplierId).NotEmpty();
        RuleFor(x => x.ReceiptDateUtc).NotEmpty().Must(BusinessDateRules.IsValid).WithMessage(BusinessDateRules.Message);
        RuleFor(x => x.SupplierInvoiceNumber).MaximumLength(128);
        RuleFor(x => x.DueDateUtc)
            .Must((x, due) => due!.Value.Date >= x.ReceiptDateUtc.Date)
            .When(x => x.DueDateUtc is not null)
            .WithMessage("The due date can't be before the receipt date.");
        RuleFor(x => x.Lines).NotEmpty().WithMessage("A direct goods receipt must have at least one line.");
        RuleForEach(x => x.Lines).ChildRules(line =>
        {
            line.RuleFor(l => l.MedicineId).NotEmpty();
            line.RuleFor(l => l.BatchNo).NotEmpty().MaximumLength(64);
            // Zero is allowed through: a zero-quantity row is skipped by the handler (bulk-import placeholders) and a
            // zero-cost line is received as free stock — only a negative value is a hard validation error.
            line.RuleFor(l => l.Quantity).GreaterThanOrEqualTo(0m);
            line.RuleFor(l => l.UnitCostPrice).GreaterThanOrEqualTo(0m);
            line.RuleFor(l => l.VatAmount).GreaterThanOrEqualTo(0m);
            line.RuleFor(l => l.RackLocation).MaximumLength(64);
            line.RuleFor(l => l.SellingPrice).GreaterThanOrEqualTo(0m).When(l => l.SellingPrice is not null);
            line.RuleFor(l => l.FreeQuantity).GreaterThanOrEqualTo(0m);
            line.RuleFor(l => l.DiscountPercent).InclusiveBetween(0m, 100m);
            line.RuleFor(l => l.DiscountAmount).GreaterThanOrEqualTo(0m);
            line.RuleFor(l => l.InBoxes).Must(b => !b).When(l => l.InPacks)
                .WithMessage("A line is entered in packs or in boxes, not both.");
            line.RuleFor(l => l)
                .Must(l => DiscountedValue(l) >= 0m)
                .WithName("DiscountAmount")
                .WithMessage("Line discount cannot be more than the line amount.");
        });
        RuleFor(x => x.BillDiscountPercent).InclusiveBetween(0m, 100m);
        RuleFor(x => x.BillDiscountAmount).GreaterThanOrEqualTo(0m);
        RuleFor(x => x)
            .Must(x => x.Lines is null || BillDiscount(x) <= x.Lines.Sum(DiscountedValue))
            .WithName("BillDiscountAmount")
            .WithMessage("Bill discount cannot be more than the bill amount.");

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
                    || x.Payment.Amount <= x.Lines.Sum(l => DiscountedValue(l) + l.VatAmount) - BillDiscount(x))
                .WithName("Payment.Amount")
                .WithMessage("The amount paid can't be more than the receipt total.");
        });
    }

    /// <summary>Line amount after its own discount (quantity × rate is the same whether entered in packs or units).</summary>
    private static decimal DiscountedValue(DirectGoodsReceiptLineInput line)
    {
        decimal gross = PurchaseLineMath.Round(line.Quantity * line.UnitCostPrice);
        return gross - PurchaseLineMath.LineDiscount(gross, line.DiscountPercent, line.DiscountAmount);
    }

    private static decimal BillDiscount(CreateDirectGoodsReceiptCommand command) =>
        PurchaseLineMath.BillDiscount(
            command.Lines.Sum(DiscountedValue), command.BillDiscountPercent, command.BillDiscountAmount);
}
