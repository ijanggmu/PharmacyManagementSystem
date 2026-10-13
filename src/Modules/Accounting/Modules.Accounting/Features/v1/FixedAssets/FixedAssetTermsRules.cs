using System.Linq.Expressions;
using FluentValidation;
using FSH.Modules.Accounting.Domain;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets;

/// <summary>Validation of an asset's depreciation terms, shared by add and edit: a known method and pool, a useful life
/// for straight line, a rate for written-down value, a tax useful life for pool E, and a residual value below the cost.</summary>
internal static class FixedAssetTermsRules
{
    public const int MaxUsefulLifeMonths = 1200;

#pragma warning disable S107 // One selector per validated field.
    public static void Apply<T>(
        AbstractValidator<T> validator,
        Func<T, decimal> cost,
        Expression<Func<T, string>> method,
        Expression<Func<T, string>> taxPool,
        Expression<Func<T, decimal>> residualValue,
        Expression<Func<T, int?>> usefulLifeMonths,
        Expression<Func<T, decimal?>> ratePercent,
        Expression<Func<T, int?>> taxUsefulLifeYears)
#pragma warning restore S107
    {
        ArgumentNullException.ThrowIfNull(validator);
        ArgumentNullException.ThrowIfNull(cost);
        ArgumentNullException.ThrowIfNull(method);

        Func<T, string> methodOf = method.Compile();
        Func<T, string> poolOf = taxPool.Compile();

        validator.RuleFor(method)
            .Must(m => FixedAssetVouchers.ParseMethod(m) is not null)
            .WithMessage("Depreciation method must be straight_line or written_down_value.");
        validator.RuleFor(taxPool)
            .Must(p => NepalTaxPoolDefaults.Find(p) is not null)
            .WithMessage("Tax pool must be one of A, B, C, D or E.");
        validator.RuleFor(residualValue)
            .GreaterThanOrEqualTo(0m)
            .Must((x, residual) => residual < cost(x)).WithMessage("The residual value must be less than the asset's cost.")
            .PrecisionScale(18, 2, ignoreTrailingZeros: true);
        validator.RuleFor(usefulLifeMonths)
            .NotNull().WithMessage("Enter the useful life (months) for straight-line depreciation.")
            .InclusiveBetween(1, MaxUsefulLifeMonths)
            .When(x => FixedAssetVouchers.ParseMethod(methodOf(x)) == FixedAssetDepreciationMethod.StraightLine);
        validator.RuleFor(ratePercent)
            .NotNull().WithMessage("Enter the yearly rate for written-down-value depreciation.")
            .GreaterThan(0m).LessThanOrEqualTo(100m)
            .When(x => FixedAssetVouchers.ParseMethod(methodOf(x)) == FixedAssetDepreciationMethod.WrittenDownValue);
        validator.RuleFor(taxUsefulLifeYears)
            .NotNull().WithMessage("Enter the useful life (years) of the intangible asset for tax (pool E).")
            .InclusiveBetween(1, 100)
            .When(x => NepalTaxPoolDefaults.Find(poolOf(x)) is { PerAssetUsefulLife: true });
    }
}
