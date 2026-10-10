using FluentValidation;
using FSH.Modules.Inventory.Contracts.v1.Consignment;

namespace FSH.Modules.Inventory.Features.v1.Consignment.SettleConsignment;

public sealed class SettleConsignmentCommandValidator : AbstractValidator<SettleConsignmentCommand>
{
    public SettleConsignmentCommandValidator()
    {
        RuleFor(x => x.SupplierId).NotEmpty();
    }
}
