using FluentValidation;
using FSH.Modules.Accounting.Services;

namespace FSH.Modules.Accounting.Features.v1;

/// <summary>
/// Shared validator rules for the business date of anything that posts (or records) money: it must be given and it
/// can't be after today in Nepal — the same rule manual voucher create/update apply. A missing date binds to
/// <c>DateTime.MinValue</c> (0001-01-01), which would otherwise slip through as "a very old day".
/// </summary>
public static class AccountingDateRules
{
    /// <summary>Whether <paramref name="dateUtc"/> falls on or before today's Nepal date.</summary>
    public static bool IsNotInFuture(DateTime dateUtc) => NepalDate.FromUtc(dateUtc) <= NepalDate.FromUtc(DateTime.UtcNow);

    public static IRuleBuilderOptions<T, DateTime> BusinessDate<T>(this IRuleBuilder<T, DateTime> rule, string what) =>
        rule
            .NotEqual(default(DateTime)).WithMessage($"Choose the {what}.")
            .Must(IsNotInFuture).WithMessage($"The {what} can't be in the future (Nepal time).");

    /// <summary>An optional business date: when given, the same rules as <see cref="BusinessDate{T}"/>.</summary>
    public static IRuleBuilderOptions<T, DateTime?> OptionalBusinessDate<T>(this IRuleBuilder<T, DateTime?> rule, string what) =>
        rule
            .Must(d => d is not { } date || date != default).WithMessage($"Choose the {what}.")
            .Must(d => d is not { } date || IsNotInFuture(date)).WithMessage($"The {what} can't be in the future (Nepal time).");
}
