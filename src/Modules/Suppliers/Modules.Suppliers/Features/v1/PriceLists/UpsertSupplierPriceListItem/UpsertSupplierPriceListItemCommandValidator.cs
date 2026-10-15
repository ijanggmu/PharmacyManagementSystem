using FluentValidation;
using FSH.Modules.Suppliers.Contracts.v1.PriceLists;
using FSH.Modules.Suppliers.Domain;

namespace FSH.Modules.Suppliers.Features.v1.PriceLists.UpsertSupplierPriceListItem;

public sealed class UpsertSupplierPriceListItemCommandValidator : AbstractValidator<UpsertSupplierPriceListItemCommand>
{
    public UpsertSupplierPriceListItemCommandValidator()
    {
        RuleFor(x => x.SupplierId).NotEmpty();
        RuleFor(x => x.MedicineId).NotEmpty();
        RuleFor(x => x.ItemId).NotEqual(Guid.Empty).When(x => x.ItemId is not null);
        RuleFor(x => x.UnitCost).GreaterThan(0m).LessThan(100_000_000m)
            .PrecisionScale(18, 4, ignoreTrailingZeros: true);
        RuleFor(x => x.MinOrderQuantity).GreaterThan(0m).When(x => x.MinOrderQuantity is not null);
        RuleFor(x => x.ValidFrom).NotEqual(default(DateOnly)).WithMessage("Enter the date the price starts.");
        RuleFor(x => x.ValidTo)
            .Must((cmd, to) => to is null || to.Value >= cmd.ValidFrom)
            .WithMessage("The price can't end before it starts.");
        RuleFor(x => x.Notes).MaximumLength(SupplierPriceListItem.NotesMaxLength);
    }
}
