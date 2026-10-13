using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;
using FSH.Modules.Accounting.Domain;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.DisposeFixedAsset;

public sealed class DisposeFixedAssetCommandValidator : AbstractValidator<DisposeFixedAssetCommand>
{
    public DisposeFixedAssetCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.DisposalDateUtc).NotEmpty();
        RuleFor(x => x.Kind)
            .Must(k => FixedAssetVouchers.ParseDisposalKind(k) is not null)
            .WithMessage("Disposal kind must be sale or write_off.");
        RuleFor(x => x.Proceeds).GreaterThanOrEqualTo(0m).PrecisionScale(18, 2, ignoreTrailingZeros: true);
        RuleFor(x => x.Proceeds)
            .GreaterThan(0m).WithMessage("Enter the sale proceeds (record a disposal for nothing as a write-off).")
            .When(x => FixedAssetVouchers.ParseDisposalKind(x.Kind) == FixedAssetDisposalKind.Sale);
        RuleFor(x => x.PaymentMethod)
            .NotEmpty().WithMessage("Choose how the sale proceeds were received.")
            .When(x => FixedAssetVouchers.ParseDisposalKind(x.Kind) == FixedAssetDisposalKind.Sale);
        RuleFor(x => x.PaymentMethod).MaximumLength(32);
        RuleFor(x => x.Notes).MaximumLength(FixedAsset.NotesMaxLength);
    }
}
