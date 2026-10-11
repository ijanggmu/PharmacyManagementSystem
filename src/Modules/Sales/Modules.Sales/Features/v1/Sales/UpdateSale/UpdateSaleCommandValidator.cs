using FluentValidation;
using FSH.Modules.Sales.Contracts.v1.Sales;

namespace FSH.Modules.Sales.Features.v1.Sales.UpdateSale;

public sealed class UpdateSaleCommandValidator : AbstractValidator<UpdateSaleCommand>
{
    public UpdateSaleCommandValidator()
    {
        RuleFor(x => x.SaleId).NotEmpty();
        RuleFor(x => x.Notes).MaximumLength(1024);
    }
}
