using FluentValidation;
using FSH.Modules.Suppliers.Contracts.v1.PriceLists;

namespace FSH.Modules.Suppliers.Features.v1.PriceLists.SearchSupplierPriceList;

public sealed class SearchSupplierPriceListQueryValidator : AbstractValidator<SearchSupplierPriceListQuery>
{
    /// <summary>Each row resolves its medicine from Inventory, so pages stay small.</summary>
    public const int MaxPageSize = 100;

    public SearchSupplierPriceListQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, MaxPageSize);
        RuleFor(x => x.SupplierId).NotEqual(Guid.Empty).When(x => x.SupplierId is not null);
        RuleFor(x => x.MedicineId).NotEqual(Guid.Empty).When(x => x.MedicineId is not null);
    }
}
