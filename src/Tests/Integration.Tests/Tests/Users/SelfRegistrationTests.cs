using System.Text.Json;
using Integration.Tests.Infrastructure;
using Integration.Tests.Infrastructure.Extensions;

namespace Integration.Tests.Tests.Users;

/// <summary>
/// Anonymous self-registration is per-tenant opt-in (SelfRegistration:AllowedTenants, off by default).
/// The test host enables it only for <see cref="TestConstants.SelfRegistrationTenantId"/>; every other
/// tenant — including root — must answer 404, and a self-registered account must stay unconfirmed
/// (unable to sign in) until the emailed link is used.
/// </summary>
[Collection(FshCollectionDefinition.Name)]
public sealed class SelfRegistrationTests : IAsyncLifetime
{
    private static readonly SemaphoreSlim TenantGate = new(1, 1);
    private static bool s_tenantReady;

    private readonly FshWebApplicationFactory _factory;
    private readonly AuthHelper _auth;

    public SelfRegistrationTests(FshWebApplicationFactory factory)
    {
        _factory = factory;
        _auth = new AuthHelper(factory);
    }

    public async Task InitializeAsync()
    {
        await TenantGate.WaitAsync();
        try
        {
            if (s_tenantReady) return;
            using var rootClient = await _auth.CreateRootAdminClientAsync();
            var response = await rootClient.PostAsJsonAsync(TestConstants.TenantsBasePath, new
            {
                id = TestConstants.SelfRegistrationTenantId,
                name = "Self registration tenant",
                connectionString = (string?)null,
                adminEmail = "admin@selfreg-it.com",
                adminPassword = TestConstants.DefaultPassword,
                issuer = "selfreg-it.issuer"
            });
            if (response.StatusCode != HttpStatusCode.Created && response.StatusCode != HttpStatusCode.Conflict)
            {
                var body = await response.Content.ReadAsStringAsync();
                throw new InvalidOperationException($"Create tenant failed: {response.StatusCode} {body}");
            }

            for (int i = 0; i < 60; i++)
            {
                // Read the top-level provisioning status. A substring match on "Completed" is not enough:
                // the payload always carries a "completedUtc" property and per-step statuses, so it would
                // match before the Seeding step has created the tenant's roles (Basic included).
                using var status = await rootClient.GetAsync($"{TestConstants.TenantsBasePath}/{TestConstants.SelfRegistrationTenantId}/provisioning");
                if (status.IsSuccessStatusCode)
                {
                    var body = await status.Content.ReadAsStringAsync();
                    using var json = JsonDocument.Parse(body);
                    var overall = json.RootElement.GetProperty("status").GetString();
                    if (string.Equals(overall, "Completed", StringComparison.OrdinalIgnoreCase))
                    {
                        s_tenantReady = true;
                        return;
                    }

                    if (string.Equals(overall, "Failed", StringComparison.OrdinalIgnoreCase))
                    {
                        throw new InvalidOperationException($"Self-registration tenant provisioning failed: {body}");
                    }
                }

                await Task.Delay(1000);
            }

            throw new TimeoutException("Self-registration tenant did not finish provisioning.");
        }
        finally
        {
            TenantGate.Release();
        }
    }

    public Task DisposeAsync() => Task.CompletedTask;

    private HttpClient ClientFor(string tenant)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("tenant", tenant);
        return client;
    }

    private static object ValidPayload(string uniqueId) => new
    {
        firstName = "Self",
        lastName = "Reg",
        email = $"self-{uniqueId}@example.com",
        userName = $"selfreg-{uniqueId}",
        password = "Test@1234!",
        confirmPassword = "Test@1234!"
    };

    [Fact]
    public async Task SelfRegister_Should_Return404_When_Tenant_Has_Not_Opted_In()
    {
        using var client = ClientFor(TestConstants.RootTenantId);

        var response = await client.PostAsJsonAsync(
            $"{TestConstants.IdentityBasePath}/self-register", ValidPayload(Guid.NewGuid().ToString("N")[..8]));

        response.StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task SelfRegister_Should_Create_Unconfirmed_User_When_Tenant_Opted_In()
    {
        using var client = ClientFor(TestConstants.SelfRegistrationTenantId);
        var uniqueId = Guid.NewGuid().ToString("N")[..8];

        var response = await client.PostAsJsonAsync($"{TestConstants.IdentityBasePath}/self-register", ValidPayload(uniqueId));

        response.StatusCode.ShouldBe(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());
        var result = await response.DeserializeAsync<RegisterResult>();
        result.UserId.ShouldNotBeNullOrWhiteSpace();

        // Never auto-confirmed: sign-in must be refused until the email link is used.
        using var login = await client.PostAsJsonAsync($"{TestConstants.IdentityBasePath}/token/issue", new
        {
            email = $"self-{uniqueId}@example.com",
            password = "Test@1234!"
        });
        login.IsSuccessStatusCode.ShouldBeFalse();
    }

    [Fact]
    public async Task SelfRegister_Should_Return400_When_PayloadInvalid()
    {
        using var client = ClientFor(TestConstants.SelfRegistrationTenantId);

        var response = await client.PostAsJsonAsync($"{TestConstants.IdentityBasePath}/self-register", new
        {
            firstName = "",
            lastName = "",
            email = "not-an-email",
            userName = "",
            password = "weak",
            confirmPassword = "weak"
        });

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task SelfRegister_Should_RejectDuplicate_When_EmailAlreadyExists()
    {
        using var client = ClientFor(TestConstants.SelfRegistrationTenantId);
        var uniqueId = Guid.NewGuid().ToString("N")[..8];
        var payload = new
        {
            firstName = "Dup",
            lastName = "Self",
            email = $"selfdup-{uniqueId}@example.com",
            userName = $"selfdup-{uniqueId}",
            password = "Test@1234!",
            confirmPassword = "Test@1234!"
        };

        var firstResponse = await client.PostAsJsonAsync($"{TestConstants.IdentityBasePath}/self-register", payload);
        firstResponse.StatusCode.ShouldBe(HttpStatusCode.Created);

        var secondResponse = await client.PostAsJsonAsync(
            $"{TestConstants.IdentityBasePath}/self-register",
            payload with { userName = $"selfdup2-{uniqueId}" });

        secondResponse.IsSuccessStatusCode.ShouldBeFalse();
    }
}
