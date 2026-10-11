using FluentValidation;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;

namespace FSH.Modules.Suppliers.Features.v1.Suppliers.DeleteSupplier;

public sealed class DeleteSupplierCommandValidator : AbstractValidator<DeleteSupplierCommand>
{
    public DeleteSupplierCommandValidator()
    {
        RuleFor(x => x.SupplierId).NotEmpty();
    }
}
