using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Tds;
using FSH.Modules.Accounting.Domain;

namespace FSH.Modules.Accounting.Features.v1.Tds.UpdateTdsCategories;

public sealed class UpdateTdsCategoriesCommandValidator : AbstractValidator<UpdateTdsCategoriesCommand>
{
    public UpdateTdsCategoriesCommandValidator()
    {
        RuleFor(x => x.Categories).NotNull().NotEmpty();
        RuleFor(x => x.Categories)
            .Must(c => c is null || c.Select(i => (i.Code ?? string.Empty).Trim()).Distinct(StringComparer.OrdinalIgnoreCase).Count() == c.Count)
            .WithMessage("Each TDS category code may appear only once.");
        RuleForEach(x => x.Categories).ChildRules(category =>
        {
            category.RuleFor(c => c.Code)
                .NotEmpty()
                .MaximumLength(TdsCategory.CodeMaxLength)
                .Matches("^[A-Za-z0-9_-]+$").WithMessage("A TDS category code may use letters, digits, '_' and '-' only.");
            category.RuleFor(c => c.Name).NotEmpty().MaximumLength(TdsCategory.NameMaxLength);
            category.RuleFor(c => c.RatePercent)
                .GreaterThan(0m).LessThanOrEqualTo(100m)
                .PrecisionScale(5, 2, ignoreTrailingZeros: true);
        });
    }
}
