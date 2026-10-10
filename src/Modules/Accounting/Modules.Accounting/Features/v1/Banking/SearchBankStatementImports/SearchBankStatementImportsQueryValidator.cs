using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Banking;

namespace FSH.Modules.Accounting.Features.v1.Banking.SearchBankStatementImports;

public sealed class SearchBankStatementImportsQueryValidator : AbstractValidator<SearchBankStatementImportsQuery>
{
    public SearchBankStatementImportsQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
    }
}
