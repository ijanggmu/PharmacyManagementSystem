using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Banking;

namespace FSH.Modules.Accounting.Features.v1.Banking.AutoMatchBankStatementImport;

public sealed class AutoMatchBankStatementImportCommandValidator : AbstractValidator<AutoMatchBankStatementImportCommand>
{
    public AutoMatchBankStatementImportCommandValidator()
    {
        RuleFor(x => x.ImportId).NotEmpty();
    }
}
