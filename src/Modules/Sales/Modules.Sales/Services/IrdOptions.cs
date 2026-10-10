namespace FSH.Modules.Sales.Services;

/// <summary>
/// Per-tenant IRD / CBMS dispatch configuration, bound from the <c>IrdOptions</c> configuration section.
/// Port of the Next.js reference's <c>ird_cbms_config</c> <c>system_settings</c> row (lib/api/ird-service.ts,
/// <c>IrdTenantConfig</c>). Keyed by tenant identifier. Secrets (<see cref="IrdTenantOptions.Password"/>,
/// <see cref="IrdTenantOptions.Token"/>) belong in user-secrets or environment variables, not in source control.
/// </summary>
/// <example>
/// <code>
/// "IrdOptions": {
///   "Tenants": {
///     "acme": {
///       "BaseUrl": "https://cbms.example.gov.np/",
///       "EndpointPath": "api/v1/invoices",
///       "AuthType": "bearer",
///       "Token": "(user-secret)",
///       "TimeoutMs": 15000
///     }
///   }
/// }
/// </code>
/// </example>
public sealed class IrdOptions
{
    public Dictionary<string, IrdTenantOptions> Tenants { get; } = new(StringComparer.OrdinalIgnoreCase);
}

/// <summary>One tenant's IRD endpoint and credentials. <see cref="AuthType"/> is <c>basic</c> or <c>bearer</c>.</summary>
public sealed class IrdTenantOptions
{
    public string? BaseUrl { get; set; }
    public string? EndpointPath { get; set; }
    public string? AuthType { get; set; }
    public string? Username { get; set; }
    public string? Password { get; set; }
    public string? Token { get; set; }

    /// <summary>Overall per-dispatch deadline. Defaults to 15 seconds (matches the Next.js reference) when unset or non-positive.</summary>
    public int? TimeoutMs { get; set; }
}
