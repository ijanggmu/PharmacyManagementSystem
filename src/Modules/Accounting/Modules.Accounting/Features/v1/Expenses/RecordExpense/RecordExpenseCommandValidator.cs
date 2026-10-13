using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Expenses;

namespace FSH.Modules.Accounting.Features.v1.Expenses.RecordExpense;

public sealed class RecordExpenseCommandValidator : AbstractValidator<RecordExpenseCommand>
{
    public RecordExpenseCommandValidator()
    {
        RuleFor(x => x.Category).NotEmpty().MaximumLength(128);
        RuleFor(x => x.Amount).GreaterThan(0m);
        // Paid now: the method picks the Cash or Bank credit. Pay later credits Accounts Payable instead.
        RuleFor(x => x.PaymentMethod).NotEmpty().When(x => x.SupplierId is null);
        RuleFor(x => x.PaymentMethod).MaximumLength(32);
        RuleFor(x => x.Description).MaximumLength(1024);
        RuleFor(x => x.ReceiptReference).MaximumLength(128);
        RuleFor(x => x.ExpenseAccountId).NotEqual(Guid.Empty).When(x => x.ExpenseAccountId is not null);
        RuleFor(x => x.SupplierId).NotEqual(Guid.Empty).When(x => x.SupplierId is not null);
        RuleFor(x => x.VatAmount!.Value)
            .GreaterThanOrEqualTo(0m)
            .LessThan(x => x.Amount).WithMessage("VAT must be less than the expense amount.")
            .When(x => x.VatAmount is not null);
        RuleFor(x => x.SupplierVatNumber).MaximumLength(32);
        RuleFor(x => x.VendorName).MaximumLength(256);

        // A VAT bill (explicit VAT or "amount includes VAT") needs the bill number; the seller's VAT number too,
        // unless the bill is owed to a supplier whose VAT number is on file (checked again in the handler).
        RuleFor(x => x.ReceiptReference)
            .NotEmpty().WithMessage("Enter the bill number of the VAT bill.")
            .When(IsVatBill);
        RuleFor(x => x.SupplierVatNumber)
            .NotEmpty().WithMessage("Enter the seller's VAT / PAN number from the VAT bill.")
            .When(x => IsVatBill(x) && x.SupplierId is null);

        // TDS: withheld under a category, on the amount excluding VAT (the handler re-checks with the resolved VAT).
        RuleFor(x => x.TdsCategory).MaximumLength(32);
        RuleFor(x => x.TdsCategory)
            .NotEmpty().WithMessage("Choose the TDS category the tax was withheld under.")
            .When(x => x.TdsAmount > 0 || x.TdsRatePercent is not null);
        RuleFor(x => x.TdsRatePercent!.Value)
            .GreaterThan(0m).LessThanOrEqualTo(100m)
            .When(x => x.TdsRatePercent is not null);
        RuleFor(x => x.TdsAmount!.Value)
            .GreaterThanOrEqualTo(0m)
            .LessThanOrEqualTo(x => x.Amount - (x.VatAmount ?? 0m)).WithMessage("TDS can't be more than the expense amount excluding VAT.")
            .When(x => x.TdsAmount is not null);
    }

    private static bool IsVatBill(RecordExpenseCommand command) =>
        command.VatAmount > 0 || (command.VatAmount is null && command.AmountIncludesVat);
}
