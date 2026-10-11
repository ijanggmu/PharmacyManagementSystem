using FluentValidation;
using FSH.Framework.Web.Validation;
using FSH.Modules.Auditing.Contracts.v1.Reports.GetEntityAuditLogs;

namespace FSH.Modules.Auditing.Features.v1.Reports.GetEntityAuditLogs;

public sealed class GetEntityAuditLogsQueryValidator : AbstractValidator<GetEntityAuditLogsQuery>
{
    public GetEntityAuditLogsQueryValidator()
    {
        Include(new PagedQueryValidator<GetEntityAuditLogsQuery>());

        RuleFor(q => q)
            .Must(q => !q.FromUtc.HasValue || !q.ToUtc.HasValue || q.FromUtc <= q.ToUtc)
            .WithMessage("FromUtc must be less than or equal to ToUtc.");

        RuleFor(q => q.TableName)
            .MaximumLength(128)
            .When(q => !string.IsNullOrEmpty(q.TableName));

        RuleFor(q => q.Action)
            .MaximumLength(32)
            .When(q => !string.IsNullOrEmpty(q.Action));

        RuleFor(q => q.TenantId)
            .MaximumLength(64)
            .Must(t => t is null || t.Trim() != "*")
            .WithMessage("Entity logs are listed one tenant at a time; \"*\" is not supported.");
    }
}
