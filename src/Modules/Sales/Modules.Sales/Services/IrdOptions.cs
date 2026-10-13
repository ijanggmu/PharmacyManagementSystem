namespace FSH.Modules.Sales.Services;

/// <summary>
/// Host-wide IRD / CBMS dispatch settings, bound from the <c>IrdOptions</c> configuration section. The per-tenant
/// part — whether e-billing is on, the CBMS API user and password, the seller PAN and an optional per-tenant base URL —
/// lives in the tenant's <c>IrdSettings</c> row (password encrypted with Data Protection), edited from the app.
/// </summary>
/// <example>
/// <code>
/// "IrdOptions": {
///   "DefaultBaseUrl": "https://cbapi.ird.gov.np",
///   "RealtimeWindowSeconds": 120
/// }
/// </code>
/// </example>
public sealed class IrdOptions
{
#pragma warning disable S1075 // IRD publishes these fixed endpoints; they are only defaults, overridable by configuration.
    /// <summary>IRD's CBMS test (sandbox) server — the default until a tenant or the host points at production.</summary>
    public const string TestBaseUrl = "http://103.1.92.174:9050";

    /// <summary>IRD's production CBMS API.</summary>
    public const string ProductionBaseUrl = "https://cbapi.ird.gov.np";
#pragma warning restore S1075

    /// <summary>Base URL used when a tenant has not set its own. Defaults to the IRD test server.</summary>
    public string DefaultBaseUrl { get; set; } = TestBaseUrl;

    /// <summary>Sales bill endpoint, relative to the base URL.</summary>
    public string BillPath { get; set; } = "api/bill";

    /// <summary>Credit note (bill return) endpoint, relative to the base URL.</summary>
    public string BillReturnPath { get; set; } = "api/billreturn";

    /// <summary>A document reaching CBMS within this many seconds of being issued is reported with
    /// <c>isrealtime = true</c>; anything later (retries, outages, manual resends) is a non-realtime sync.</summary>
    public int RealtimeWindowSeconds { get; set; } = 120;

    /// <summary>Overall deadline for one dispatch (ms).</summary>
    public int TimeoutMs { get; set; } = 15_000;
}
