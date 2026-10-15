using FluentValidation;
using FSH.Modules.Suppliers.Contracts.v1.PriceLists;

namespace FSH.Modules.Suppliers.Features.v1.PriceLists.GetSupplierPrices;

public sealed class GetSupplierPricesQueryValidator : AbstractValidator<GetSupplierPricesQuery>
{
    public GetSupplierPricesQueryValidator()
    {
        RuleFor(x => x.SupplierId).NotEmpty();
        RuleFor(x => x.AsOf).NotEqual(default(DateOnly));
        RuleFor(x => x.MedicineIds).NotNull()
            .Must(ids => ids is null || ids.Count <= GetSupplierPricesQuery.MaxMedicineIds)
            .WithMessage($"Ask for at most {GetSupplierPricesQuery.MaxMedicineIds} medicines at a time.");
    }
}
