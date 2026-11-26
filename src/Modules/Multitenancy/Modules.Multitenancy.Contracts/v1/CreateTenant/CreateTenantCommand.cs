using Mediator;

namespace FSH.Modules.Multitenancy.Contracts.v1.CreateTenant;

/// <summary>
/// Creates a tenant. <c>Id</c> is the tenant code (sign-in code / host label): leave it null or empty to
/// generate a unique one from <c>Name</c> (preview it with <c>GET /tenants/code-suggestion</c>).
/// </summary>
public sealed record CreateTenantCommand(
    string? Id,
    string Name,
    string? ConnectionString,
    string AdminEmail,
    string AdminPassword,
    string? Issuer,
    string? PlanKey = null) : ICommand<CreateTenantCommandResponse>;
