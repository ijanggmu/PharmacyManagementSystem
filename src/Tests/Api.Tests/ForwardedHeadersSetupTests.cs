using System.Net;
using FSH.Starter.Api;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Shouldly;
using Xunit;

namespace Api.Tests;

public sealed class ForwardedHeadersSetupTests
{
    private static ForwardedHeadersOptions Build(Dictionary<string, string?>? settings = null)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(settings ?? []).Build();
        var services = new ServiceCollection();
        services.AddTrustedForwardedHeaders(configuration);
        return services.BuildServiceProvider().GetRequiredService<IOptions<ForwardedHeadersOptions>>().Value;
    }

    private static async Task<IPAddress?> ClientIpAsync(ForwardedHeadersOptions options, string remote, string forwardedFor)
    {
        var context = new DefaultHttpContext();
        context.Connection.RemoteIpAddress = IPAddress.Parse(remote);
        context.Request.Headers["X-Forwarded-For"] = forwardedFor;
        var middleware = new ForwardedHeadersMiddleware(_ => Task.CompletedTask, Microsoft.Extensions.Logging.Abstractions.NullLoggerFactory.Instance, Options.Create(options));
        await middleware.Invoke(context);
        return context.Connection.RemoteIpAddress;
    }

    [Fact]
    public async Task Should_Use_Forwarded_Client_Ip_From_Private_Network_Proxy()
    {
        var ip = await ClientIpAsync(Build(), remote: "172.18.0.5", forwardedFor: "203.0.113.7");

        ip.ShouldBe(IPAddress.Parse("203.0.113.7"));
    }

    [Fact]
    public async Task Should_Ignore_Forwarded_Header_From_Public_Address()
    {
        // A client on the internet hitting the API directly must not be able to choose its own IP.
        var ip = await ClientIpAsync(Build(), remote: "198.51.100.20", forwardedFor: "1.2.3.4");

        ip.ShouldBe(IPAddress.Parse("198.51.100.20"));
    }

    [Fact]
    public async Task Should_Not_Trust_Spoofed_Leftmost_Entry_Beyond_Trusted_Hops()
    {
        // Edge proxy appended the real client (203.0.113.7) after a spoofed value; the BFF hop is private.
        var ip = await ClientIpAsync(Build(), remote: "172.18.0.5", forwardedFor: "6.6.6.6, 203.0.113.7");

        ip.ShouldBe(IPAddress.Parse("203.0.113.7"));
    }

    [Fact]
    public void Should_Honour_Configured_Networks()
    {
        var options = Build(new() { ["ForwardedHeaders:KnownNetworks:0"] = "10.1.0.0/16" });

        options.KnownIPNetworks.Count.ShouldBe(1);
        options.KnownProxies.ShouldBeEmpty();
    }
}
