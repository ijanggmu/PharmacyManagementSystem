using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Identity.Domain;
using Integration.Tests.Infrastructure;
using Integration.Tests.Infrastructure.Extensions;
using Microsoft.AspNetCore.Identity;

namespace Integration.Tests.Tests.Tickets;

/// <summary>
/// Own-ticket vs tenant-admin access, enforced server-side. A freshly registered user only holds
/// the Basic role (Tickets.View + Tickets.Create are IsBasic) — no Tickets.ViewAll — so they:
/// <list type="bullet">
///   <item>see only the tickets they reported in GET /tickets (forced reporter filter);</item>
///   <item>get 404 (not 403) on another user's ticket, its comments, and comment/close/reopen on it;</item>
///   <item>can view, comment on, close (once resolved) and reopen their OWN ticket;</item>
///   <item>get 403 on admin-only actions (assign, resolve) and on pre-assigning a ticket at create.</item>
/// </list>
/// The root tenant's Admin holds Tickets.ViewAll and sees every ticket of the tenant.
/// </summary>
[Collection(FshCollectionDefinition.Name)]
public sealed class TicketOwnershipAccessTests
{
    private readonly FshWebApplicationFactory _factory;
    private readonly AuthHelper _auth;

    public TicketOwnershipAccessTests(FshWebApplicationFactory factory)
    {
        _factory = factory;
        _auth = new AuthHelper(factory);
    }

    [Fact]
    public async Task Search_Should_ReturnOnlyOwnTickets_ForNonAdmin_And_AllTickets_ForAdmin()
    {
        using var admin = await _auth.CreateRootAdminClientAsync();
        using var alice = await RegisterAndLoginAsync("tkalice");
        using var bob = await RegisterAndLoginAsync("tkbob");

        var aliceTicket = await CreateTicketAsync(alice, UniqueTitle("Alice"));
        var bobTicket = await CreateTicketAsync(bob, UniqueTitle("Bob"));

        // Alice: only her own ticket, even when she asks for Bob's explicitly.
        var alicePage = await SearchAsync(alice, "pageNumber=1&pageSize=200");
        alicePage.Items.ShouldContain(t => t.Id == aliceTicket);
        alicePage.Items.ShouldNotContain(t => t.Id == bobTicket);
        alicePage.Items.ShouldAllBe(t => t.ReporterUserId == alicePage.Items[0].ReporterUserId);

        var bobProfileId = (await GetTicketAsync(bob, bobTicket)).ReporterUserId;
        var spoofed = await SearchAsync(alice, $"pageNumber=1&pageSize=200&reporterUserId={bobProfileId}");
        spoofed.Items.ShouldBeEmpty();

        // Admin: both.
        var adminPage = await SearchAsync(admin, "pageNumber=1&pageSize=200&sortBy=createdAtUtc&sortDir=desc");
        var adminIds = adminPage.Items.Select(t => t.Id).ToList();
        adminIds.ShouldContain(aliceTicket);
        adminIds.ShouldContain(bobTicket);
    }

    [Fact]
    public async Task OtherUsersTicket_Should_Return404_ForEveryOwnTicketEndpoint()
    {
        using var alice = await RegisterAndLoginAsync("tkalice");
        using var bob = await RegisterAndLoginAsync("tkbob");
        var bobTicket = await CreateTicketAsync(bob, UniqueTitle("Bob-private"));

        using var get = await alice.GetAsync($"{TestConstants.TicketsBasePath}/tickets/{bobTicket}");
        get.StatusCode.ShouldBe(HttpStatusCode.NotFound);

        using var comments = await alice.GetAsync($"{TestConstants.TicketsBasePath}/tickets/{bobTicket}/comments");
        comments.StatusCode.ShouldBe(HttpStatusCode.NotFound);

        using var comment = await alice.PostAsJsonAsync(
            $"{TestConstants.TicketsBasePath}/tickets/{bobTicket}/comments", new { body = "snooping" });
        comment.StatusCode.ShouldBe(HttpStatusCode.NotFound);

        using var close = await alice.PostAsync($"{TestConstants.TicketsBasePath}/tickets/{bobTicket}/close", null);
        close.StatusCode.ShouldBe(HttpStatusCode.NotFound);

        using var reopen = await alice.PostAsync($"{TestConstants.TicketsBasePath}/tickets/{bobTicket}/reopen", null);
        reopen.StatusCode.ShouldBe(HttpStatusCode.NotFound);

        // Bob's ticket is untouched (no comment slipped in).
        (await GetTicketAsync(bob, bobTicket)).CommentCount.ShouldBe(0);
    }

    [Fact]
    public async Task Reporter_Should_View_Comment_Close_And_Reopen_OwnTicket()
    {
        using var admin = await _auth.CreateRootAdminClientAsync();
        using var alice = await RegisterAndLoginAsync("tkalice");
        var ticketId = await CreateTicketAsync(alice, UniqueTitle("Alice-lifecycle"));

        // View + comment on own ticket.
        (await GetTicketAsync(alice, ticketId)).Status.ShouldBe("Open");
        using (var comment = await alice.PostAsJsonAsync(
                   $"{TestConstants.TicketsBasePath}/tickets/{ticketId}/comments", new { body = "More detail" }))
        {
            comment.StatusCode.ShouldBe(HttpStatusCode.OK);
        }

        using (var list = await alice.GetAsync($"{TestConstants.TicketsBasePath}/tickets/{ticketId}/comments"))
        {
            list.StatusCode.ShouldBe(HttpStatusCode.OK);
            (await list.DeserializeAsync<TicketCommentDto[]>()).Length.ShouldBe(1);
        }

        // Admin sees the reporter's ticket and can comment on it too.
        using (var adminComment = await admin.PostAsJsonAsync(
                   $"{TestConstants.TicketsBasePath}/tickets/{ticketId}/comments", new { body = "Looking into it" }))
        {
            adminComment.StatusCode.ShouldBe(HttpStatusCode.OK);
        }

        // Closing an unresolved ticket is still a state-machine 409 for the reporter.
        using (var earlyClose = await alice.PostAsync($"{TestConstants.TicketsBasePath}/tickets/{ticketId}/close", null))
        {
            earlyClose.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        }

        // Admin resolves; reporter confirms by closing, then reopens when the issue returns.
        using (var resolve = await admin.PostAsJsonAsync(
                   $"{TestConstants.TicketsBasePath}/tickets/{ticketId}/resolve", new { resolutionNote = "Fixed" }))
        {
            resolve.StatusCode.ShouldBe(HttpStatusCode.OK);
        }

        using (var close = await alice.PostAsync($"{TestConstants.TicketsBasePath}/tickets/{ticketId}/close", null))
        {
            close.StatusCode.ShouldBe(HttpStatusCode.OK);
        }
        (await GetTicketAsync(alice, ticketId)).Status.ShouldBe("Closed");

        using (var reopen = await alice.PostAsync($"{TestConstants.TicketsBasePath}/tickets/{ticketId}/reopen", null))
        {
            reopen.StatusCode.ShouldBe(HttpStatusCode.OK);
        }
        (await GetTicketAsync(alice, ticketId)).Status.ShouldBe("Open");
    }

    [Fact]
    public async Task Reporter_Should_GetForbidden_On_AdminOnlyActions()
    {
        using var alice = await RegisterAndLoginAsync("tkalice");
        var ticketId = await CreateTicketAsync(alice, UniqueTitle("Alice-adminonly"));

        using var assign = await alice.PostAsJsonAsync(
            $"{TestConstants.TicketsBasePath}/tickets/{ticketId}/assign", new { assigneeUserId = Guid.NewGuid() });
        assign.StatusCode.ShouldBe(HttpStatusCode.Forbidden);

        using var resolve = await alice.PostAsJsonAsync(
            $"{TestConstants.TicketsBasePath}/tickets/{ticketId}/resolve", new { resolutionNote = "self-resolved" });
        resolve.StatusCode.ShouldBe(HttpStatusCode.Forbidden);

        using var preAssigned = await alice.PostAsJsonAsync($"{TestConstants.TicketsBasePath}/tickets", new
        {
            title = UniqueTitle("Alice-preassigned"),
            description = (string?)null,
            priority = "Medium",
            assignedToUserId = Guid.NewGuid(),
        });
        preAssigned.StatusCode.ShouldBe(HttpStatusCode.Forbidden);

        (await GetTicketAsync(alice, ticketId)).Status.ShouldBe("Open");
    }

    // ─── helpers ─────────────────────────────────────────────────────

    private static string UniqueTitle(string prefix) => $"{prefix}-{Guid.NewGuid().ToString("N")[..8]}";

    private static async Task<Guid> CreateTicketAsync(HttpClient client, string title)
    {
        using var response = await client.PostAsJsonAsync($"{TestConstants.TicketsBasePath}/tickets", new
        {
            title,
            description = (string?)null,
            priority = "Medium",
            assignedToUserId = (Guid?)null,
        });
        response.StatusCode.ShouldBe(HttpStatusCode.OK,
            $"setup failed to create ticket: {await response.Content.ReadAsStringAsync()}");
        return await response.DeserializeAsync<Guid>();
    }

    private static async Task<TicketDto> GetTicketAsync(HttpClient client, Guid ticketId)
    {
        using var response = await client.GetAsync($"{TestConstants.TicketsBasePath}/tickets/{ticketId}");
        response.StatusCode.ShouldBe(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        return await response.DeserializeAsync<TicketDto>();
    }

    private static async Task<PagedResult<TicketDto>> SearchAsync(HttpClient client, string queryString)
    {
        using var response = await client.GetAsync($"{TestConstants.TicketsBasePath}/tickets?{queryString}");
        response.StatusCode.ShouldBe(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        return await response.DeserializeAsync<PagedResult<TicketDto>>();
    }

    /// <summary>
    /// Registers a fresh root-tenant user (Basic role only), confirms their email so they can sign
    /// in, and returns an authenticated client — same pattern as FileVisibilityAndSharingTests.
    /// </summary>
    private async Task<HttpClient> RegisterAndLoginAsync(string prefix)
    {
        using var adminClient = await _auth.CreateRootAdminClientAsync();
        var unique = Guid.NewGuid().ToString("N")[..8];
        var email = $"{prefix}-{unique}@example.com";
        var userName = $"{prefix}{unique}";
        const string password = "Test@1234!";

        using var response = await adminClient.PostAsJsonAsync($"{TestConstants.IdentityBasePath}/register", new
        {
            firstName = prefix,
            lastName = "Test",
            email,
            userName,
            password,
            confirmPassword = password,
        });
        response.StatusCode.ShouldBe(HttpStatusCode.Created);
        var registered = await response.DeserializeAsync<RegisterResult>();

        using (var scope = _factory.Services.CreateScope())
        {
            var tenant = await scope.ServiceProvider.GetRequiredService<IMultiTenantStore<AppTenantInfo>>()
                .GetAsync(TestConstants.RootTenantId);
            scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>().MultiTenantContext =
                new MultiTenantContext<AppTenantInfo>(tenant);

            var userManager = scope.ServiceProvider.GetRequiredService<UserManager<FshUser>>();
            var user = await userManager.FindByIdAsync(registered.UserId);
            user.ShouldNotBeNull();
            if (!user!.EmailConfirmed)
            {
                user.EmailConfirmed = true;
                (await userManager.UpdateAsync(user)).Succeeded.ShouldBeTrue();
            }
        }

        return await _auth.CreateAuthenticatedClientAsync(email, password);
    }
}
