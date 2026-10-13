using FluentValidation;
using FSH.Modules.Sales.Contracts.v1.Sales;

namespace FSH.Modules.Sales.Features.v1.Sales.CancelSale;

public sealed class CancelSaleCommandValidator : AbstractValidator<CancelSaleCommand>
{
    public CancelSaleCommandValidator()
    {
        RuleFor(x => x.SaleId).NotEmpty();
        RuleFor(x => x.Reason).NotEmpty().MaximumLength(512);
        RuleFor(x => x.ApprovalTokens).Must(t => t is null || t.Count <= 5).WithMessage("At most 5 approval tokens.");
        RuleForEach(x => x.ApprovalTokens).NotEmpty().MaximumLength(128);
    }
}
