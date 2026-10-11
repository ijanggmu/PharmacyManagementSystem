using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Vouchers;

namespace FSH.Modules.Accounting.Features.v1.Vouchers.SearchVouchers;

public sealed class SearchVouchersQueryValidator : AbstractValidator<SearchVouchersQuery>
{
    public SearchVouchersQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
        RuleFor(x => x.Search).MaximumLength(128);
        RuleFor(x => x.VoucherType).MaximumLength(64);
        RuleFor(x => x.Status)
            .Must(s => VoucherStatusFilters.All.Contains(s!.Trim(), StringComparer.OrdinalIgnoreCase))
            .When(x => !string.IsNullOrWhiteSpace(x.Status))
            .WithMessage("Status must be one of: " + string.Join(", ", VoucherStatusFilters.All) + ".");
        RuleFor(x => x.Source)
            .Must(s => VoucherSourceFilters.All.Contains(s!.Trim(), StringComparer.OrdinalIgnoreCase))
            .When(x => !string.IsNullOrWhiteSpace(x.Source))
            .WithMessage("Source must be one of: " + string.Join(", ", VoucherSourceFilters.All) + ".");
        RuleFor(x => x.DateToUtc)
            .GreaterThanOrEqualTo(x => x.DateFromUtc)
            .When(x => x.DateFromUtc.HasValue && x.DateToUtc.HasValue)
            .WithMessage("DateToUtc must be on or after DateFromUtc.");
    }
}
