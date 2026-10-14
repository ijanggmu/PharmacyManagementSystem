using FluentValidation;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;
using FSH.Modules.Accounting.Domain;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.CreateFixedAsset;

public sealed class CreateFixedAssetCommandValidator : AbstractValidator<CreateFixedAssetCommand>
{
    public CreateFixedAssetCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(FixedAsset.NameMaxLength);
        RuleFor(x => x.Category).NotEmpty().MaximumLength(FixedAsset.CategoryMaxLength);
        RuleFor(x => x.AcquisitionDateUtc).BusinessDate("acquisition date");
        RuleFor(x => x.Amount).GreaterThan(0m).PrecisionScale(18, 2, ignoreTrailingZeros: true);
        RuleFor(x => x.VatAmount)
            .GreaterThanOrEqualTo(0m)
            .LessThan(x => x.Amount).WithMessage("VAT must be less than the bill amount.")
            .PrecisionScale(18, 2, ignoreTrailingZeros: true);
        RuleFor(x => x.Source)
            .Must(s => FixedAssetVouchers.ParseSource(s) is not null)
            .WithMessage($"Source must be {FixedAssetValues.Sources.CashBank}, {FixedAssetValues.Sources.Supplier} or {FixedAssetValues.Sources.Opening}.");

        FixedAssetTermsRules.Apply(this, x => x.Amount - x.VatAmount, x => x.DepreciationMethod, x => x.TaxPool, x => x.ResidualValue,
            x => x.UsefulLifeMonths, x => x.RatePercent, x => x.TaxUsefulLifeYears);

        RuleFor(x => x.PaymentMethod)
            .NotEmpty().WithMessage("Choose how the asset was paid for.")
            .When(x => FixedAssetVouchers.ParseSource(x.Source) == FixedAssetAcquisitionSource.CashBank);
        RuleFor(x => x.PaymentMethod).MaximumLength(32);
        RuleFor(x => x.SupplierId)
            .NotEmpty().WithMessage("Choose the supplier the bill is owed to.")
            .When(x => FixedAssetVouchers.ParseSource(x.Source) == FixedAssetAcquisitionSource.Supplier);
        RuleFor(x => x.VendorName).MaximumLength(256);
        RuleFor(x => x.SupplierVatNumber).MaximumLength(32);
        RuleFor(x => x.BillNumber).MaximumLength(128);
        RuleFor(x => x.BillNumber)
            .NotEmpty().WithMessage("Enter the bill number of the VAT bill.")
            .When(x => x.VatAmount > 0m);
        RuleFor(x => x.AssetTag).MaximumLength(FixedAsset.TagMaxLength);
        RuleFor(x => x.Location).MaximumLength(FixedAsset.LocationMaxLength);
        RuleFor(x => x.Notes).MaximumLength(FixedAsset.NotesMaxLength);
        RuleFor(x => x.BranchId).NotEqual(Guid.Empty).When(x => x.BranchId is not null);

        // Opening assets: no purchase VAT, a go-live date on/after the acquisition, depreciation to date within the cost.
        When(x => FixedAssetVouchers.ParseSource(x.Source) == FixedAssetAcquisitionSource.Opening, () =>
        {
            RuleFor(x => x.VatAmount).Equal(0m).WithMessage("An opening asset carries no purchase VAT — enter its cost excluding VAT.");
            RuleFor(x => x.DepreciationStartDateUtc)
                .NotNull().WithMessage("Enter the go-live date the opening balance is as of.")
                .GreaterThanOrEqualTo(x => x.AcquisitionDateUtc).WithMessage("The go-live date can't be before the acquisition date.");
            RuleFor(x => x.OpeningAccumulatedDepreciation)
                .GreaterThanOrEqualTo(0m)
                .LessThanOrEqualTo(x => x.Amount - x.ResidualValue)
                .WithMessage("Depreciation to date can't be more than the cost less the residual value.")
                .PrecisionScale(18, 2, ignoreTrailingZeros: true);
            RuleFor(x => x.OpeningTaxWrittenDownValue!.Value)
                .GreaterThanOrEqualTo(0m)
                .PrecisionScale(18, 2, ignoreTrailingZeros: true)
                .When(x => x.OpeningTaxWrittenDownValue is not null);
        });
        RuleFor(x => x.OpeningAccumulatedDepreciation)
            .Equal(0m).WithMessage("Depreciation to date is only for an opening (pre-go-live) asset.")
            .When(x => FixedAssetVouchers.ParseSource(x.Source) is { } s && s != FixedAssetAcquisitionSource.Opening);
    }
}
