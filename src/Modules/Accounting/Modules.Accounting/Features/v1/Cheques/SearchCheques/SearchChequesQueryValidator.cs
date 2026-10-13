using FluentValidation;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.Cheques;
using FSH.Modules.Accounting.Domain;

namespace FSH.Modules.Accounting.Features.v1.Cheques.SearchCheques;

public sealed class SearchChequesQueryValidator : AbstractValidator<SearchChequesQuery>
{
    public SearchChequesQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
        RuleFor(x => x.Status)
            .Must(s => Cheque.StatusFromWire(s) is not null)
            .WithMessage($"Status must be one of: {string.Join(", ", ChequeValues.Statuses)}.")
            .When(x => !string.IsNullOrWhiteSpace(x.Status));
        RuleFor(x => x.Direction)
            .Must(d => Cheque.DirectionFromWire(d) is not null)
            .WithMessage("Direction must be received or issued.")
            .When(x => !string.IsNullOrWhiteSpace(x.Direction));
        RuleFor(x => x.ChequeDateToUtc)
            .GreaterThanOrEqualTo(x => x.ChequeDateFromUtc)
            .When(x => x.ChequeDateFromUtc is not null && x.ChequeDateToUtc is not null)
            .WithMessage("The 'to' date can't be before the 'from' date.");
        RuleFor(x => x.Search).MaximumLength(100);
    }
}
