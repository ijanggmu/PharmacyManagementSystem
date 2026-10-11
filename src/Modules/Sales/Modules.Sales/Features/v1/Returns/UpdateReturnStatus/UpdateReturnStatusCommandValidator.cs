using FluentValidation;
using FSH.Modules.Sales.Contracts.v1.Returns;

namespace FSH.Modules.Sales.Features.v1.Returns.UpdateReturnStatus;

public sealed class UpdateReturnStatusCommandValidator : AbstractValidator<UpdateReturnStatusCommand>
{
    public UpdateReturnStatusCommandValidator()
    {
        RuleFor(x => x.ReturnId).NotEmpty();
        RuleFor(x => x.Notes).MaximumLength(1024);
    }
}
