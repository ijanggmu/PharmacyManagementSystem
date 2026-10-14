using FluentValidation;
using FSH.Modules.Sales.Contracts.v1.Returns;
using FSH.Modules.Sales.Domain;

namespace FSH.Modules.Sales.Features.v1.Returns.CreateReturn;

public sealed class CreateReturnCommandValidator : AbstractValidator<CreateReturnCommand>
{
    public CreateReturnCommandValidator()
    {
        RuleFor(x => x.SaleId).NotEmpty();
        RuleFor(x => x.Status).NotEmpty();
        RuleFor(x => x.Notes).MaximumLength(1024);
        RuleFor(x => x.RefundMethod)
            .MaximumLength(32)
            .Must(RefundMethods.IsKnown)
            .WithMessage("Refund method must be one of: " + string.Join(", ", RefundMethods.All) + ".");
        RuleFor(x => x.ApprovalTokens).Must(t => t is null || t.Count <= 5).WithMessage("At most 5 approval tokens.");
        RuleForEach(x => x.ApprovalTokens).NotEmpty().MaximumLength(128);
        RuleFor(x => x.ReturnItems).NotEmpty().WithMessage("At least one return item is required.");
        RuleForEach(x => x.ReturnItems).ChildRules(item =>
        {
            item.RuleFor(i => i.SaleItemId).NotEmpty();
            item.RuleFor(i => i.QuantityReturned).GreaterThan(0m);
            item.RuleFor(i => i.Reason).NotEmpty();
        });
    }
}
