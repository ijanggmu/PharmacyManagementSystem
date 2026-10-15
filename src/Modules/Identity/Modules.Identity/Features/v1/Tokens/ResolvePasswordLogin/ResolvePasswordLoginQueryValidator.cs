using FluentValidation;
using FSH.Modules.Identity.Contracts.v1.Tokens.ResolvePasswordLogin;

namespace FSH.Modules.Identity.Features.v1.Tokens.ResolvePasswordLogin;

public sealed class ResolvePasswordLoginQueryValidator : AbstractValidator<ResolvePasswordLoginQuery>
{
    public ResolvePasswordLoginQueryValidator()
    {
        RuleFor(p => p.Email)
            .Cascade(CascadeMode.Stop)
            .NotEmpty()
            .MaximumLength(256)
            .EmailAddress();

        RuleFor(p => p.Password)
            .Cascade(CascadeMode.Stop)
            .NotEmpty()
            .MaximumLength(256);
    }
}
