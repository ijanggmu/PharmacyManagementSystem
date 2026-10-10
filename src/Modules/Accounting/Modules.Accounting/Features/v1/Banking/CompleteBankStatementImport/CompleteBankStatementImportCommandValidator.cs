using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Banking;

namespace FSH.Modules.Accounting.Features.v1.Banking.CompleteBankStatementImport;

public sealed class CompleteBankStatementImportCommandValidator : AbstractValidator<CompleteBankStatementImportCommand>
{
    public CompleteBankStatementImportCommandValidator()
    {
        RuleFor(x => x.ImportId).NotEmpty();
    }
}
