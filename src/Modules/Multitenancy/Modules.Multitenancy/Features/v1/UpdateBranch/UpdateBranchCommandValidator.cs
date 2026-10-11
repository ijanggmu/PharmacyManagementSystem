using FluentValidation;
using FSH.Modules.Multitenancy.Contracts.v1.UpdateBranch;

namespace FSH.Modules.Multitenancy.Features.v1.UpdateBranch;

public sealed class UpdateBranchCommandValidator : AbstractValidator<UpdateBranchCommand>
{
    public UpdateBranchCommandValidator()
    {
        RuleFor(b => b.Id)
            .NotEmpty();

        RuleFor(b => b.Name)
            .NotEmpty()
            .MaximumLength(200);

        RuleFor(b => b.Code)
            .NotEmpty()
            .MaximumLength(32);

        RuleFor(b => b.Address)
            .MaximumLength(300);

        RuleFor(b => b.Phone)
            .MaximumLength(32);

        RuleFor(b => b.Email)
            .MaximumLength(256);
    }
}
