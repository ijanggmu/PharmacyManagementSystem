using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using FSH.Modules.Accounting.Domain;

namespace FSH.Modules.Accounting.Features.v1.Reports.UpdateCashFlowClassifications;

public sealed class UpdateCashFlowClassificationsCommandValidator : AbstractValidator<UpdateCashFlowClassificationsCommand>
{
    public const int MaxItems = 500;

    public UpdateCashFlowClassificationsCommandValidator()
    {
        RuleFor(x => x.Items).NotEmpty();
        RuleFor(x => x.Items)
            .Must(items => items.Count <= MaxItems)
            .WithMessage($"At most {MaxItems} accounts can be classified at once.")
            .Must(items => items.Select(i => i.AccountId).Distinct().Count() == items.Count)
            .WithMessage("Each account can appear only once.")
            .When(x => x.Items is not null);
        RuleForEach(x => x.Items).ChildRules(item =>
        {
            item.RuleFor(i => i.AccountId).NotEmpty();
            item.RuleFor(i => i.Activity)
                .Must(BeKnownActivity)
                .WithMessage("Activity must be Operating, Investing, Financing or NonCash.");
        });
    }

    private static bool BeKnownActivity(string? activity) =>
        activity is null
        || (!int.TryParse(activity, out _)
            && Enum.TryParse<CashFlowActivity>(activity, ignoreCase: true, out var parsed)
            && Enum.IsDefined(parsed));
}
