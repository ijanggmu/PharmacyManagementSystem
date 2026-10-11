using FluentValidation;
using FSH.Modules.Purchasing.Contracts.v1.DirectGoodsReceipts;

namespace FSH.Modules.Purchasing.Features.v1.DirectGoodsReceipts.VoidDirectGoodsReceipt;

public sealed class VoidDirectGoodsReceiptCommandValidator : AbstractValidator<VoidDirectGoodsReceiptCommand>
{
    public VoidDirectGoodsReceiptCommandValidator()
    {
        RuleFor(x => x.ReceiptId).NotEmpty();
        RuleFor(x => x.Reason).NotEmpty().MaximumLength(500);
    }
}
