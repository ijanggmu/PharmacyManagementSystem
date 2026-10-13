using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.PaymentAccounts;
using FSH.Modules.Accounting.Services;

namespace FSH.Modules.Accounting.Features.v1.PaymentAccounts.UpdatePaymentMethodAccounts;

public sealed class UpdatePaymentMethodAccountsCommandValidator : AbstractValidator<UpdatePaymentMethodAccountsCommand>
{
    public UpdatePaymentMethodAccountsCommandValidator()
    {
        RuleFor(x => x.Mappings)
            .NotEmpty()
            .WithMessage("Choose at least one payment method to update.");
        RuleFor(x => x.Mappings)
            .Must(m => m is null || m.Select(i => PaymentMethodAccounts.Normalize(i.Method)).Distinct(StringComparer.Ordinal).Count() == m.Count)
            .WithMessage("Each payment method can appear only once.");
        RuleForEach(x => x.Mappings).ChildRules(item =>
        {
            item.RuleFor(i => i.Method)
                .Must(PaymentMethodAccounts.IsKnown)
                .WithMessage(i => $"'{i.Method}' isn't a payment method. Use one of: {string.Join(", ", PaymentMethodAccounts.Methods)}.");
            item.RuleFor(i => i.AccountId)
                .Must(id => id is null || id != Guid.Empty)
                .WithMessage("Choose an account.");
        });
    }
}
