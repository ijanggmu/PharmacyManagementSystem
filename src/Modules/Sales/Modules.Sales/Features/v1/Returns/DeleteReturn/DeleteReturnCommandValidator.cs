using FluentValidation;
using FSH.Modules.Sales.Contracts.v1.Returns;

namespace FSH.Modules.Sales.Features.v1.Returns.DeleteReturn;

public sealed class DeleteReturnCommandValidator : AbstractValidator<DeleteReturnCommand>
{
    public DeleteReturnCommandValidator()
    {
        RuleFor(x => x.ReturnId).NotEmpty();
    }
}
