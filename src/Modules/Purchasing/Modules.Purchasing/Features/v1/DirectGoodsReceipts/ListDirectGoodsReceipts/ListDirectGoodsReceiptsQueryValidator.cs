using FluentValidation;
using FSH.Modules.Purchasing.Contracts.v1.DirectGoodsReceipts;

namespace FSH.Modules.Purchasing.Features.v1.DirectGoodsReceipts.ListDirectGoodsReceipts;

public sealed class ListDirectGoodsReceiptsQueryValidator : AbstractValidator<ListDirectGoodsReceiptsQuery>
{
    public ListDirectGoodsReceiptsQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, ListDirectGoodsReceiptsQuery.MaxPageSize);
        RuleFor(x => x.Status)
            .Must(status => ListDirectGoodsReceiptsQueryHandler.TryParseStatus(status, out _))
            .WithMessage("Status must be Received or Voided.");
        RuleFor(x => x.Search).MaximumLength(200);
        RuleFor(x => x.Source)
            .Must(source => ListDirectGoodsReceiptsQueryHandler.TryParseSource(source, out _))
            .WithMessage("Source must be SupplierBill, PurchaseOrder or StockEntry.");
        RuleFor(x => x.DateToUtc)
            .GreaterThanOrEqualTo(x => x.DateFromUtc)
            .When(x => x.DateFromUtc is not null && x.DateToUtc is not null)
            .WithMessage("The end date cannot be before the start date.");
    }
}
