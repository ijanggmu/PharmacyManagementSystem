using FluentValidation;
using FSH.Modules.Suppliers.Contracts.v1.Returns;
using FSH.Modules.Suppliers.Services;

namespace FSH.Modules.Suppliers.Features.v1.Returns.CreateSupplierReturn;

public sealed class CreateSupplierReturnCommandValidator : AbstractValidator<CreateSupplierReturnCommand>
{
    public CreateSupplierReturnCommandValidator()
    {
        RuleFor(x => x.SupplierId).NotEmpty();
        RuleFor(x => x.ReturnDateUtc).NotEmpty().Must(BusinessDateRules.IsValid).WithMessage(BusinessDateRules.Message);
        RuleFor(x => x.Notes).MaximumLength(1024);
        RuleFor(x => x.SupplierInvoiceNumber).MaximumLength(100);
        RuleFor(x => x.Items).NotEmpty();

        RuleForEach(x => x.Items).ChildRules(item =>
        {
            item.RuleFor(i => i.MedicineId).NotEmpty();
            item.RuleFor(i => i.Quantity).GreaterThan(0m);
            item.RuleFor(i => i.UnitCost).GreaterThanOrEqualTo(0m);
            item.RuleFor(i => i.ReturnReason).NotEmpty().MaximumLength(256);
            item.RuleFor(i => i.Notes).MaximumLength(1024);
        });
    }
}
