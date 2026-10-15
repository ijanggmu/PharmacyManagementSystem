using FluentValidation;
using FSH.Modules.Suppliers.Contracts.v1.PriceLists;

namespace FSH.Modules.Suppliers.Features.v1.PriceLists.DeleteSupplierPriceListItem;

public sealed class DeleteSupplierPriceListItemCommandValidator : AbstractValidator<DeleteSupplierPriceListItemCommand>
{
    public DeleteSupplierPriceListItemCommandValidator()
    {
        RuleFor(x => x.SupplierId).NotEmpty();
        RuleFor(x => x.ItemId).NotEmpty();
    }
}
