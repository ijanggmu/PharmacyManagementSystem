using FluentValidation;
using FSH.Modules.Sales.Contracts.v1.PriceLevels;
using FSH.Modules.Sales.Domain;

namespace FSH.Modules.Sales.Features.v1.PriceLevels;

public sealed class CreatePriceLevelCommandValidator : AbstractValidator<CreatePriceLevelCommand>
{
    public CreatePriceLevelCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(PriceLevel.MaxNameLength);
        RuleFor(x => x.DiscountPercent).SetValidator(new LevelPercentValidator());
        RuleFor(x => x.Description).MaximumLength(PriceLevel.MaxDescriptionLength);
    }
}

public sealed class UpdatePriceLevelCommandValidator : AbstractValidator<UpdatePriceLevelCommand>
{
    public UpdatePriceLevelCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(PriceLevel.MaxNameLength);
        RuleFor(x => x.DiscountPercent).SetValidator(new LevelPercentValidator());
        RuleFor(x => x.Description).MaximumLength(PriceLevel.MaxDescriptionLength);
    }
}

public sealed class SetPriceLevelItemCommandValidator : AbstractValidator<SetPriceLevelItemCommand>
{
    public SetPriceLevelItemCommandValidator()
    {
        RuleFor(x => x.PriceLevelId).NotEmpty();
        RuleFor(x => x.MedicineId).NotEmpty();
        RuleFor(x => x.UnitPrice!.Value)
            .GreaterThan(0m)
            .PrecisionScale(18, 2, ignoreTrailingZeros: true)
            .WithMessage("A level price is a positive amount in whole paisa.")
            .When(x => x.UnitPrice is not null);
    }
}

public sealed class AssignCustomerPriceLevelCommandValidator : AbstractValidator<AssignCustomerPriceLevelCommand>
{
    public AssignCustomerPriceLevelCommandValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty();
        RuleFor(x => x.PriceLevelId).NotEqual(Guid.Empty).When(x => x.PriceLevelId is not null);
    }
}

public sealed class GetPriceQuoteQueryValidator : AbstractValidator<GetPriceQuoteQuery>
{
    public GetPriceQuoteQueryValidator()
    {
        RuleFor(x => x.MedicineIds).Must(ids => ids is null || ids.Count <= 500).WithMessage("At most 500 medicines per quote.");
    }
}

/// <summary>A level is 0 to just under 100% below the lot price (a 100% level would give medicines away).</summary>
internal sealed class LevelPercentValidator : AbstractValidator<decimal>
{
    public LevelPercentValidator()
    {
        RuleFor(x => x)
            .GreaterThanOrEqualTo(0m)
            .LessThan(100m)
            .PrecisionScale(5, 2, ignoreTrailingZeros: true)
            .WithName("Discount percent")
            .WithMessage("The level's discount is 0 to 99.99% below the lot price.");
    }
}
