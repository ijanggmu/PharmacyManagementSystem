using Microsoft.Extensions.Caching.Hybrid;
using Microsoft.Extensions.DependencyInjection;

namespace Appointments.Tests.Features;

/// <summary>A real in-memory <see cref="HybridCache"/>, so tests see the same caching and tag purges as the API.</summary>
internal static class TestHybridCache
{
    public static HybridCache Create() =>
        new ServiceCollection().AddHybridCache().Services.BuildServiceProvider().GetRequiredService<HybridCache>();
}
