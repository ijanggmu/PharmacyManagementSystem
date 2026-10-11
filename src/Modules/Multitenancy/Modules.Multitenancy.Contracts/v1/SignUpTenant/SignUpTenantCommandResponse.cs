namespace FSH.Modules.Multitenancy.Contracts.v1.SignUpTenant;

/// <param name="TenantId">The new tenant's id/slug — also the <c>/t/{TenantId}/login</c> path segment.</param>
/// <param name="ProvisioningCorrelationId">Correlation id for the provisioning run; pass to the
/// provisioning-status lookup if the caller wants to confirm completion before redirecting.</param>
/// <param name="Status">Provisioning status at the time this response was built (<c>Pending</c>,
/// <c>Running</c> or — when provisioning ran inline/synchronously — already <c>Completed</c>).</param>
public sealed record SignUpTenantCommandResponse(
    string TenantId,
    string ProvisioningCorrelationId,
    string Status);
