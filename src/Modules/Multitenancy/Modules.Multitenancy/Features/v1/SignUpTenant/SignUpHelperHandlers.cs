using System.Text.RegularExpressions;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Multitenancy.Contracts.v1.SignUpTenant;
using FSH.Modules.Multitenancy.Contracts.v1.TenantProvisioning;
using Mediator;

namespace FSH.Modules.Multitenancy.Features.v1.SignUpTenant;

public sealed class GetSignUpStatusQueryHandler(IMediator mediator) : IQueryHandler<GetSignUpStatusQuery, SignUpStatusDto>
{
    public async ValueTask<SignUpStatusDto> Handle(GetSignUpStatusQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var status = await mediator.Send(new GetTenantProvisioningStatusQuery(query.TenantId), cancellationToken).ConfigureAwait(false);

        // The same "not found" for a wrong correlation id, so this can't be used to probe tenants.
        if (!string.Equals(status.CorrelationId, query.CorrelationId, StringComparison.Ordinal))
        {
            throw new NotFoundException("Sign-up not found.");
        }

        bool failed = string.Equals(status.Status, "Failed", StringComparison.OrdinalIgnoreCase);
        return new SignUpStatusDto(
            status.TenantId,
            status.Status,
            status.CurrentStep,
            failed ? "We couldn't finish setting up your pharmacy. Please try again in a moment or contact support." : null,
            status.Steps.Select(s => new SignUpStepDto(s.Step, s.Status)).ToList());
    }
}

public sealed partial class CheckSignUpAvailabilityQueryHandler(ITenantService tenantService)
    : IQueryHandler<CheckSignUpAvailabilityQuery, SignUpAvailabilityDto>
{
    public async ValueTask<SignUpAvailabilityDto> Handle(CheckSignUpAvailabilityQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        bool? slugAvailable = null;
        string? slugMessage = null;
        string? slug = query.Slug?.Trim();
        if (!string.IsNullOrEmpty(slug))
        {
            if (!SlugPattern().IsMatch(slug))
            {
                (slugAvailable, slugMessage) = (false, "Use 2–40 lowercase letters, numbers and single hyphens.");
            }
            else if (SignUpTenantCommandValidator.ReservedSlugs.Contains(slug))
            {
                (slugAvailable, slugMessage) = (false, $"'{slug}' is reserved.");
            }
            else if (await tenantService.ExistsWithIdAsync(slug, cancellationToken).ConfigureAwait(false))
            {
                (slugAvailable, slugMessage) = (false, "This code is already taken.");
            }
            else
            {
                slugAvailable = true;
            }
        }

        bool? nameAvailable = null;
        string? nameMessage = null;
        string? name = query.PharmacyName?.Trim();
        if (!string.IsNullOrEmpty(name))
        {
            nameAvailable = !await tenantService.ExistsWithNameAsync(name, cancellationToken).ConfigureAwait(false);
            nameMessage = nameAvailable == true ? null : "A pharmacy with this name is already registered.";
        }

        return new SignUpAvailabilityDto(slugAvailable, slugMessage, nameAvailable, nameMessage);
    }

    [GeneratedRegex("^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$")]
    private static partial Regex SlugPattern();
}
