using FSH.Modules.Multitenancy.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Multitenancy.Contracts.v1.GetTenantByCode;

/// <summary>Resolves an active tenant by its code, anonymously. .NET-side equivalent of <c>GET /api/tenants/by-code/[code]</c>.</summary>
public sealed record GetTenantByCodeQuery(string Code) : IQuery<TenantLookupDto>;
