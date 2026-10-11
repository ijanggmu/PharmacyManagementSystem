using Microsoft.AspNetCore.HttpOverrides;
using System.Net;

namespace FSH.Starter.Api;

/// <summary>
/// Restores the real client IP / scheme behind the reverse proxy and the Next.js BFF, so the IP-keyed
/// rate limiter, audit records and session rows see the browser's address instead of the proxy's
/// (otherwise every user shares one bucket and the "auth" limit locks the whole pharmacy out).
/// Only hops inside the configured private networks / proxies are trusted, so a client on the public
/// internet cannot spoof <c>X-Forwarded-For</c>. Lives in the host (not BuildingBlocks) because the
/// trust boundary is a deployment concern.
/// </summary>
internal static class ForwardedHeadersSetup
{
    public const string SectionName = "ForwardedHeaders";

    /// <summary>Docker bridge / compose networks, loopback and RFC 1918 / ULA ranges.</summary>
    private static readonly string[] DefaultTrustedNetworks =
    [
        "127.0.0.0/8",
        "10.0.0.0/8",
        "172.16.0.0/12",
        "192.168.0.0/16",
        "::1/128",
        "fc00::/7",
    ];

    public static IServiceCollection AddTrustedForwardedHeaders(this IServiceCollection services, IConfiguration configuration)
    {
        var section = configuration.GetSection(SectionName);
        var networks = section.GetSection("KnownNetworks").Get<string[]>() is { Length: > 0 } configured
            ? configured
            : DefaultTrustedNetworks;
        var proxies = section.GetSection("KnownProxies").Get<string[]>() ?? [];
        int forwardLimit = section.GetValue<int?>("ForwardLimit") ?? 2;

        services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            // Each trusted hop (edge proxy, BFF) appends one entry; process at most this many from the right.
            options.ForwardLimit = forwardLimit;
            options.KnownIPNetworks.Clear();
            options.KnownProxies.Clear();
            foreach (string cidr in networks)
            {
                options.KnownIPNetworks.Add(System.Net.IPNetwork.Parse(cidr));
            }

            foreach (string proxy in proxies)
            {
                options.KnownProxies.Add(IPAddress.Parse(proxy));
            }
        });

        return services;
    }
}
