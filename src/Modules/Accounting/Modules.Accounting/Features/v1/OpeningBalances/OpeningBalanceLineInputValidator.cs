using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.OpeningBalances;
using FSH.Modules.Accounting.Domain;

namespace FSH.Modules.Accounting.Features.v1.OpeningBalances;

/// <summary>Shape checks shared by Set and Edit; account-level rules run in the handler.</summary>
public sealed class OpeningBalanceLineInputValidator : AbstractValidator<OpeningBalanceLineInput>
{
    public OpeningBalanceLineInputValidator()
    {
        RuleFor(x => x.AccountId).NotEmpty();
        RuleFor(x => x.DebitAmount).GreaterThanOrEqualTo(0).PrecisionScale(18, 2, ignoreTrailingZeros: true);
        RuleFor(x => x.CreditAmount).GreaterThanOrEqualTo(0).PrecisionScale(18, 2, ignoreTrailingZeros: true);
        RuleFor(x => x)
            .Must(x => (x.DebitAmount > 0) != (x.CreditAmount > 0))
            .WithMessage("Each line needs either a debit or a credit amount, not both or neither.");
    }

    /// <summary>Opening dates can not be in the future (one day of slack for time zones ahead of UTC).</summary>
    internal static bool NotInFuture(DateOnly date) =>
        date <= DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1));

    internal static int MaxLines => OpeningBalanceRules.MaxLines;
}
