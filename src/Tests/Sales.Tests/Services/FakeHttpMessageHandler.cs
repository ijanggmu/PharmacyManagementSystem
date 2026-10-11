using System.Net.Http;

namespace Sales.Tests.Services;

/// <summary>
/// In-memory <see cref="HttpMessageHandler"/> for IRD dispatch tests: records every request (and its body)
/// and answers through a caller-supplied delegate. No network is ever touched.
/// </summary>
internal sealed class FakeHttpMessageHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> respond)
    : HttpMessageHandler
{
    public List<HttpRequestMessage> Requests { get; } = [];

    public List<string?> RequestBodies { get; } = [];

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        Requests.Add(request);
        RequestBodies.Add(request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken));

        return await respond(request, cancellationToken);
    }
}

/// <summary>Hands out one <see cref="HttpClient"/> wrapping the fake handler (the handler is not disposed with it).</summary>
internal sealed class FakeHttpClientFactory(HttpMessageHandler handler) : IHttpClientFactory
{
    public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
}
