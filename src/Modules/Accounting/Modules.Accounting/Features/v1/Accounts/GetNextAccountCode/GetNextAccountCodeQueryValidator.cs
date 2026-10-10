using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Accounts;

namespace FSH.Modules.Accounting.Features.v1.Accounts.GetNextAccountCode;

public sealed class GetNextAccountCodeQueryValidator : AbstractValidator<GetNextAccountCodeQuery>
{
    public GetNextAccountCodeQueryValidator()
    {
        RuleFor(x => x.ParentId).NotEmpty();
    }
}
