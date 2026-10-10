using FluentValidation;
using FSH.Framework.Web.Validation;
using FSH.Modules.Tickets.Contracts.v1.Tickets;

namespace FSH.Modules.Tickets.Features.v1.Tickets.ListTicketsAcrossTenants;

public sealed class ListTicketsAcrossTenantsQueryValidator : AbstractValidator<ListTicketsAcrossTenantsQuery>
{
    public ListTicketsAcrossTenantsQueryValidator()
    {
        Include(new PagedQueryValidator<ListTicketsAcrossTenantsQuery>());

        RuleFor(q => q)
            .Must(q => !q.FromUtc.HasValue || !q.ToUtc.HasValue || q.FromUtc <= q.ToUtc)
            .WithMessage("FromUtc must be less than or equal to ToUtc.");

        RuleFor(q => q.Search)
            .MaximumLength(200)
            .When(q => !string.IsNullOrEmpty(q.Search));

        RuleFor(q => q.TenantId)
            .MaximumLength(64)
            .When(q => !string.IsNullOrEmpty(q.TenantId));
    }
}
