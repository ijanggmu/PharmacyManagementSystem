namespace FSH.Modules.Multitenancy.Contracts.Dtos;

/// <summary>
/// Public, anonymous tenant lookup result (login page pharmacy-name hint). Both fields are null when no
/// active tenant matches the code. Mirrors the Next.js reference's <c>GET /api/tenants/by-code/[code]</c>.
/// </summary>
public sealed record TenantLookupDto(string? Name, string? Code);
