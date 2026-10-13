using System.Diagnostics.CodeAnalysis;
using FSH.Framework.Core.Context;
using FSH.Framework.Persistence;
using FSH.Modules.Identity.Contracts.Approvals;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Identity.Data;
using FSH.Modules.Identity.Domain;
using FSH.Modules.Identity.Services.Approvals;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;

namespace Identity.Tests.Approvals;

/// <summary>
/// Redeeming manager approvals: a token is accepted only for the user it was issued to, the same action and target,
/// an amount it covers, before it expires, and only once; a holder of the direct permission needs no token.
/// </summary>
public sealed class ApprovalServiceTests : IDisposable
{
    private readonly IdentityDbContext _db = IdentityDbContextFactory.Create();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly IUserPermissionService _permissions = Substitute.For<IUserPermissionService>();
    private readonly MutableTimeProvider _time = new(new DateTimeOffset(2026, 10, 13, 6, 0, 0, TimeSpan.Zero));
    private readonly Guid _cashierId = Guid.CreateVersion7();
    private readonly string _managerId = Guid.CreateVersion7().ToString();

    public ApprovalServiceTests()
    {
        _currentUser.GetUserId().Returns(_cashierId);
    }

    public void Dispose() => _db.Dispose();

    private ApprovalService CreateSut() =>
        new(_db, new AmbientDbTransactionRegistry(), _currentUser, _permissions, _time, NullLogger<ApprovalService>.Instance);

    private async Task<string> IssueAsync(
        string action = ApprovalActions.SaleVoid, decimal amount = 500m, string? target = "sale-1", string? requesterId = null)
    {
        string token = ApprovalTokens.Generate();
        _db.ApprovalGrants.Add(ApprovalGrant.Issue(
            ApprovalTokens.Hash(token), action, amount, target, "wrong item", requesterId ?? _cashierId.ToString(), "Cashier",
            _managerId, "Manager", _time.GetUtcNow().UtcDateTime, ApprovalTokens.Lifetime));
        await _db.SaveChangesAsync();
        return token;
    }

    private static ApprovalRequirement Void(decimal amount = 500m, string? target = "sale-1") =>
        new(ApprovalActions.SaleVoid, amount, target, "cancelling sale INV-1");

    #region Happy Path

    [Fact]
    public async Task AuthorizeAsync_Should_RedeemToken_When_BoundToUserActionTargetAndAmount()
    {
        string token = await IssueAsync();

        var grant = await CreateSut().AuthorizeAsync(Void(), [token]);

        grant.ShouldNotBeNull();
        grant.ApproverUserId.ShouldBe(_managerId);
        (await _db.ApprovalGrants.SingleAsync()).UsedAtUtc.ShouldBe(_time.GetUtcNow().UtcDateTime);
    }

    [Fact]
    public async Task AuthorizeAsync_Should_AcceptLargerApproval_When_AmountNeededIsSmaller()
    {
        string token = await IssueAsync(amount: 600m);

        (await CreateSut().AuthorizeAsync(Void(amount: 450m), [token])).ShouldNotBeNull();
    }

    [Fact]
    public async Task AuthorizeAsync_Should_NotNeedToken_When_UserHoldsDirectPermission()
    {
        _permissions.HasPermissionAsync(_cashierId.ToString(), "Permissions.Sales.Sales.Cancel", Arg.Any<CancellationToken>()).Returns(true);

        var grant = await CreateSut().AuthorizeAsync(Void(), approvalTokens: null, directPermission: "Permissions.Sales.Sales.Cancel");

        grant.ShouldBeNull();
    }

    [Fact]
    public async Task AuthorizeAsync_Should_FindTheMatchingToken_When_SeveralAreSent()
    {
        string discount = await IssueAsync(ApprovalActions.SaleDiscount, 12m, "checkout-1");
        string credit = await IssueAsync(ApprovalActions.CreditOverride, 900m, "checkout-1");

        var grant = await CreateSut().AuthorizeAsync(
            new ApprovalRequirement(ApprovalActions.CreditOverride, 850m, "checkout-1", "over limit"), [discount, credit]);

        grant!.Action.ShouldBe(ApprovalActions.CreditOverride);
        (await _db.ApprovalGrants.CountAsync(g => g.UsedAtUtc != null)).ShouldBe(1);
    }

    #endregion

    #region Misuse

    [Fact]
    public async Task AuthorizeAsync_Should_RequireApproval_When_NoTokenIsSent()
    {
        var ex = await Should.ThrowAsync<ApprovalRequiredException>(() => CreateSut().AuthorizeAsync(Void(), []));

        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.Forbidden);
        ex.ErrorMessages.ShouldBe(["approval_required", ApprovalActions.SaleVoid, "500", "sale-1"]);
    }

    [Fact]
    public async Task AuthorizeAsync_Should_RefuseToken_When_UsedTwice()
    {
        string token = await IssueAsync();
        var sut = CreateSut();
        await sut.AuthorizeAsync(Void(), [token]);

        await Should.ThrowAsync<ApprovalRequiredException>(() => sut.AuthorizeAsync(Void(), [token]));
    }

    [Fact]
    public async Task AuthorizeAsync_Should_RefuseToken_When_Expired()
    {
        string token = await IssueAsync();
        _time.Advance(ApprovalTokens.Lifetime + TimeSpan.FromSeconds(1));

        await Should.ThrowAsync<ApprovalRequiredException>(() => CreateSut().AuthorizeAsync(Void(), [token]));
        (await _db.ApprovalGrants.SingleAsync()).UsedAtUtc.ShouldBeNull();
    }

    [Fact]
    public async Task AuthorizeAsync_Should_RefuseToken_When_IssuedForAnotherAction()
    {
        string token = await IssueAsync(ApprovalActions.SaleDiscount, 500m, "sale-1");

        await Should.ThrowAsync<ApprovalRequiredException>(() => CreateSut().AuthorizeAsync(Void(), [token]));
    }

    [Fact]
    public async Task AuthorizeAsync_Should_RefuseToken_When_IssuedForAnotherTarget()
    {
        string token = await IssueAsync(target: "sale-2");

        await Should.ThrowAsync<ApprovalRequiredException>(() => CreateSut().AuthorizeAsync(Void(), [token]));
    }

    [Fact]
    public async Task AuthorizeAsync_Should_RefuseToken_When_IssuedToAnotherUser()
    {
        string token = await IssueAsync(requesterId: Guid.CreateVersion7().ToString());

        await Should.ThrowAsync<ApprovalRequiredException>(() => CreateSut().AuthorizeAsync(Void(), [token]));
    }

    [Fact]
    public async Task AuthorizeAsync_Should_RefuseToken_When_AmountNeededIsLarger()
    {
        string token = await IssueAsync(amount: 100m);

        await Should.ThrowAsync<ApprovalRequiredException>(() => CreateSut().AuthorizeAsync(Void(amount: 100.01m), [token]));
    }

    [Fact]
    public async Task AuthorizeAsync_Should_RefuseForgedToken()
    {
        await IssueAsync();

        await Should.ThrowAsync<ApprovalRequiredException>(() => CreateSut().AuthorizeAsync(Void(), [ApprovalTokens.Generate()]));
    }

    [Fact]
    public void ApprovalGrants_Should_Be_TenantScoped()
    {
        // Tenant isolation is the framework default (ApplyTenantIsolationByDefault); the grant must not opt out.
        var entity = _db.Model.FindEntityType(typeof(ApprovalGrant))!;
        entity.FindProperty("TenantId").ShouldNotBeNull();
        typeof(FSH.Framework.Core.Domain.IGlobalEntity).IsAssignableFrom(typeof(ApprovalGrant)).ShouldBeFalse();
    }

    #endregion

    [SuppressMessage("Design", "CA1812", Justification = "Instantiated by the tests.")]
    internal sealed class MutableTimeProvider(DateTimeOffset start) : TimeProvider
    {
        private DateTimeOffset _now = start;

        public override DateTimeOffset GetUtcNow() => _now;

        public void Advance(TimeSpan by) => _now = _now.Add(by);
    }
}
