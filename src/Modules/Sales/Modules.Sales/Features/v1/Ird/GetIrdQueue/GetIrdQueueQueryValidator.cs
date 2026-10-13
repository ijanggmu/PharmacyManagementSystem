using FluentValidation;
using FSH.Framework.Web.Validation;

namespace FSH.Modules.Sales.Features.v1.Ird.GetIrdQueue;

public sealed class GetIrdQueueQueryValidator : AbstractValidator<GetIrdQueueQuery>
{
    private static readonly string[] Statuses = ["Pending", "Processing", "Sent", "Failed"];

    public GetIrdQueueQueryValidator()
    {
        Include(new PagedQueryValidator<GetIrdQueueQuery>());

        RuleFor(q => q.Status)
            .Must(s => string.IsNullOrWhiteSpace(s) || Statuses.Contains(s.Trim(), StringComparer.OrdinalIgnoreCase))
            .WithMessage("Status must be one of: Pending, Processing, Sent, Failed.");

        RuleFor(q => q.DocumentType)
            .Must(t => string.IsNullOrWhiteSpace(t)
                || t.Trim().Equals("Bill", StringComparison.OrdinalIgnoreCase)
                || t.Trim().Equals("Return", StringComparison.OrdinalIgnoreCase))
            .WithMessage("DocumentType must be Bill or Return.");

        RuleFor(q => q)
            .Must(q => !q.FromUtc.HasValue || !q.ToUtc.HasValue || q.FromUtc <= q.ToUtc)
            .WithMessage("FromUtc must be less than or equal to ToUtc.");
    }
}
