using FluentValidation;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;

namespace FSH.Modules.Suppliers.Features.v1.Suppliers.RestoreSupplier;

public sealed class RestoreSupplierCommandValidator : AbstractValidator<RestoreSupplierCommand>
{
    public RestoreSupplierCommandValidator()
    {
        RuleFor(x => x.SupplierId).NotEmpty();
    }
}
