using FluentValidation;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders.ReceivePurchaseOrder;

public sealed class ReceivePurchaseOrderCommandValidator : AbstractValidator<ReceivePurchaseOrderCommand>
{
    public ReceivePurchaseOrderCommandValidator()
    {
        RuleFor(x => x.PurchaseOrderId).NotEmpty();
        // Every goods receipt is a supplier bill: its tax invoice number is what the VAT purchase register and
        // the supplier ledger are matched on, so it can't be posted without one.
        RuleFor(x => x.SupplierInvoiceNumber)
            .NotEmpty().WithMessage("Enter the supplier's tax invoice / bill number.")
            .MaximumLength(64);
        RuleFor(x => x.DueDateUtc)
            .Must((x, due) => due!.Value.Date >= (x.ReceiptDateUtc ?? DateTime.UtcNow).Date)
            .When(x => x.DueDateUtc is not null)
            .WithMessage("The due date can't be before the receipt date.");
        RuleForEach(x => x.Lines).ChildRules(line =>
        {
            line.RuleFor(l => l.LineId).NotEmpty();
            line.RuleFor(l => l.BatchNo).MaximumLength(64);
            line.RuleFor(l => l.SellingPrice).GreaterThanOrEqualTo(0m).When(l => l.SellingPrice is not null);
            line.RuleFor(l => l.QuantityReceived).GreaterThanOrEqualTo(0m).When(l => l.QuantityReceived is not null);
            line.RuleFor(l => l.FreeQuantityReceived).GreaterThanOrEqualTo(0m).When(l => l.FreeQuantityReceived is not null);
        }).When(x => x.Lines is not null);
        RuleFor(x => x.Lines)
            .Must(lines => lines!.Select(l => l.LineId).Distinct().Count() == lines!.Count)
            .When(x => x.Lines is not null)
            .WithMessage("Each order line can appear only once in a receipt.");
    }
}
