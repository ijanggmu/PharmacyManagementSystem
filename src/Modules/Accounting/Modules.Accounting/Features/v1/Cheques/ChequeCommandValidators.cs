using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Cheques;
using FSH.Modules.Accounting.Domain;

namespace FSH.Modules.Accounting.Features.v1.Cheques;

/// <summary>Shared rules: an action date can't be after today in Nepal.</summary>
internal static class ChequeRules
{
    public static bool NotInFuture(DateTime dateUtc) => AccountingDateRules.IsNotInFuture(dateUtc);

    public const string FutureMessage = "The date can't be in the future (Nepal time).";
}

public sealed class DepositChequeCommandValidator : AbstractValidator<DepositChequeCommand>
{
    public DepositChequeCommandValidator()
    {
        RuleFor(x => x.ChequeId).NotEmpty();
        RuleFor(x => x.DepositDateUtc)
            .Cascade(CascadeMode.Stop)
            .NotEqual(default(DateTime)).WithMessage("Enter the deposit date.")
            .Must(ChequeRules.NotInFuture).WithMessage(ChequeRules.FutureMessage);
        RuleFor(x => x.BankAccountId).Must(id => id is null || id != Guid.Empty).WithMessage("Choose the bank account.");
        RuleFor(x => x.Note).MaximumLength(Cheque.NoteMaxLength);
    }
}

public sealed class ClearChequeCommandValidator : AbstractValidator<ClearChequeCommand>
{
    public ClearChequeCommandValidator()
    {
        RuleFor(x => x.ChequeId).NotEmpty();
        RuleFor(x => x.ClearedDateUtc)
            .Cascade(CascadeMode.Stop)
            .NotEqual(default(DateTime)).WithMessage("Enter the clearance date.")
            .Must(ChequeRules.NotInFuture).WithMessage(ChequeRules.FutureMessage);
        RuleFor(x => x.BankAccountId).Must(id => id is null || id != Guid.Empty).WithMessage("Choose the bank account.");
        RuleFor(x => x.Note).MaximumLength(Cheque.NoteMaxLength);
    }
}

public sealed class BounceChequeCommandValidator : AbstractValidator<BounceChequeCommand>
{
    public BounceChequeCommandValidator()
    {
        RuleFor(x => x.ChequeId).NotEmpty();
        RuleFor(x => x.Reason)
            .Cascade(CascadeMode.Stop)
            .NotEmpty().WithMessage("Give the reason the bank returned the cheque (e.g. insufficient funds).")
            .Must(r => r.Trim().Length >= 3).WithMessage("Give a short reason (at least 3 characters).")
            .MaximumLength(400);
    }
}

public sealed class CancelChequeCommandValidator : AbstractValidator<CancelChequeCommand>
{
    public CancelChequeCommandValidator()
    {
        RuleFor(x => x.ChequeId).NotEmpty();
        RuleFor(x => x.Reason)
            .Cascade(CascadeMode.Stop)
            .NotEmpty().WithMessage("Give a reason for cancelling the cheque.")
            .Must(r => r.Trim().Length >= 3).WithMessage("Give a short reason (at least 3 characters).")
            .MaximumLength(400);
    }
}
