using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Identity.Contracts.Approvals;
using FSH.Modules.Identity.Contracts.Authorization;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Identity.Contracts.v1.Approvals;
using FSH.Modules.Identity.Data;
using FSH.Modules.Identity.Domain;
using FSH.Modules.Identity.Features.v1.Approvals.IssueApproval;
using FSH.Modules.Identity.Services.Approvals;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;

namespace Identity.Tests.Approvals;

/// <summary>
/// Issuing a manager approval: the approver's password is re-verified (failures count toward their lockout), they
/// must hold Approvals.Approve, be active and not be the requester; only the token's hash is stored, with who/what.
/// </summary>
public sealed class IssueApprovalCommandHandlerTests : IDisposable
{
    private const string Password = "Manager#2026";

    private readonly IdentityDbContext _db = IdentityDbContextFactory.Create();
    private readonly UserManager<FshUser> _userManager =
        Substitute.For<UserManager<FshUser>>(Substitute.For<IUserStore<FshUser>>(), null, null, null, null, null, null, null, null);
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly IUserPermissionService _permissions = Substitute.For<IUserPermissionService>();
    private readonly Guid _cashierId = Guid.CreateVersion7();
    private readonly FshUser _manager = new()
    {
        Id = Guid.CreateVersion7().ToString(),
        Email = "manager@pharmacy.test",
        UserName = "manager",
        FirstName = "Sita",
        LastName = "Sharma",
        IsActive = true,
    };

    public IssueApprovalCommandHandlerTests()
    {
        _currentUser.GetUserId().Returns(_cashierId);
        _currentUser.Name.Returns("Ram Cashier");
        _userManager.FindByEmailAsync(_manager.Email!).Returns(_manager);
        _userManager.SupportsUserLockout.Returns(true);
        _userManager.IsLockedOutAsync(_manager).Returns(false);
        _userManager.CheckPasswordAsync(_manager, Password).Returns(true);
        _permissions.HasPermissionAsync(_manager.Id, IdentityPermissions.Approvals.Approve, Arg.Any<CancellationToken>()).Returns(true);
    }

    public void Dispose()
    {
        _db.Dispose();
        _userManager.Dispose();
    }

    private readonly ApprovalAttemptThrottle _throttle = new(
        new ServiceCollection().AddHybridCache().Services.BuildServiceProvider().GetRequiredService<HybridCache>(),
        TimeProvider.System);

    private IssueApprovalCommandHandler CreateSut() =>
        new(_userManager, _db, _currentUser, _permissions, TimeProvider.System, NullLogger<IssueApprovalCommandHandler>.Instance, _throttle);

    private static IssueApprovalCommand Command(string password = Password, string login = "manager@pharmacy.test") =>
        new(login, password, ApprovalActions.SaleVoid, 1250.5m, " sale-1 ", "wrong medicine scanned");

    [Fact]
    public async Task Handle_Should_IssueSingleUseToken_And_LogWhoApprovedWhat()
    {
        var response = await CreateSut().Handle(Command(), CancellationToken.None);

        response.Token.ShouldStartWith(ApprovalTokens.Prefix);
        response.ApproverName.ShouldBe("Sita Sharma");
        var grant = await _db.ApprovalGrants.SingleAsync();
        grant.TokenHash.ShouldBe(ApprovalTokens.Hash(response.Token));
        grant.TokenHash.ShouldNotContain(response.Token);
        grant.Action.ShouldBe(ApprovalActions.SaleVoid);
        grant.Amount.ShouldBe(1250.5m);
        grant.TargetRef.ShouldBe("sale-1");
        grant.Reason.ShouldBe("wrong medicine scanned");
        grant.RequestedByUserId.ShouldBe(_cashierId.ToString());
        grant.RequestedByName.ShouldBe("Ram Cashier");
        grant.ApproverUserId.ShouldBe(_manager.Id);
        grant.UsedAtUtc.ShouldBeNull();
        (grant.ExpiresAtUtc - grant.CreatedAtUtc).ShouldBe(ApprovalTokens.Lifetime);
    }

    [Fact]
    public async Task Handle_Should_FindApproverByUserName_When_NotAnEmail()
    {
        _userManager.FindByNameAsync("manager").Returns(_manager);

        var response = await CreateSut().Handle(Command(login: "manager"), CancellationToken.None);

        response.Token.ShouldNotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task Handle_Should_LeaveApproversSignInLockoutAlone_When_PasswordIsWrong()
    {
        var ex = await Should.ThrowAsync<CustomException>(() => CreateSut().Handle(Command(password: "guess"), CancellationToken.None).AsTask());

        ex.Message.ShouldBe(IssueApprovalCommandHandler.InvalidCredentialsMessage);
        await _userManager.DidNotReceive().AccessFailedAsync(Arg.Any<FshUser>());
        await _userManager.DidNotReceive().ResetAccessFailedCountAsync(Arg.Any<FshUser>());
        _db.ApprovalGrants.ShouldBeEmpty();
    }

    [Fact]
    public async Task Handle_Should_ThrottleRequester_After_RepeatedWrongPasswords_WithoutLockingTheApproverOut()
    {
        for (int i = 0; i < ApprovalAttemptThrottle.MaxFailuresPerApprover; i++)
        {
            var wrong = await Should.ThrowAsync<CustomException>(() => CreateSut().Handle(Command(password: "guess"), CancellationToken.None).AsTask());
            wrong.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        }

        var blocked = await Should.ThrowAsync<CustomException>(() => CreateSut().Handle(Command(), CancellationToken.None).AsTask());

        blocked.StatusCode.ShouldBe(HttpStatusCode.TooManyRequests);
        blocked.Message.ShouldBe(IssueApprovalCommandHandler.TooManyAttemptsMessage);
        await _userManager.DidNotReceive().AccessFailedAsync(Arg.Any<FshUser>());
        _db.ApprovalGrants.ShouldBeEmpty();

        // Another cashier is not held back by this one's failures, and the approver can still approve.
        _currentUser.GetUserId().Returns(Guid.CreateVersion7());
        var response = await CreateSut().Handle(Command(), CancellationToken.None);
        response.Token.ShouldNotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task Handle_Should_ThrottleRequester_SprayingManyApprovers()
    {
        for (int i = 0; i < ApprovalAttemptThrottle.MaxFailuresPerRequester; i++)
        {
            string login = $"nobody{i}@pharmacy.test";
            await Should.ThrowAsync<CustomException>(() => CreateSut().Handle(Command(login: login), CancellationToken.None).AsTask());
        }

        var blocked = await Should.ThrowAsync<CustomException>(() => CreateSut().Handle(Command(), CancellationToken.None).AsTask());

        blocked.StatusCode.ShouldBe(HttpStatusCode.TooManyRequests);
    }

    [Fact]
    public async Task Handle_Should_RefuseWithSameMessage_When_ApproverUnknownOrInactive()
    {
        var unknown = await Should.ThrowAsync<CustomException>(() =>
            CreateSut().Handle(Command(login: "nobody@pharmacy.test"), CancellationToken.None).AsTask());
        _manager.IsActive = false;
        var inactive = await Should.ThrowAsync<CustomException>(() => CreateSut().Handle(Command(), CancellationToken.None).AsTask());

        unknown.Message.ShouldBe(IssueApprovalCommandHandler.InvalidCredentialsMessage);
        inactive.Message.ShouldBe(IssueApprovalCommandHandler.InvalidCredentialsMessage);
        _db.ApprovalGrants.ShouldBeEmpty();
    }

    [Fact]
    public async Task Handle_Should_Refuse_When_ApproverIsLockedOut()
    {
        _userManager.IsLockedOutAsync(_manager).Returns(true);

        var ex = await Should.ThrowAsync<CustomException>(() => CreateSut().Handle(Command(), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.Locked);
        await _userManager.DidNotReceive().CheckPasswordAsync(Arg.Any<FshUser>(), Arg.Any<string>());
    }

    [Fact]
    public async Task Handle_Should_Refuse_When_ApproverLacksApprovePermission()
    {
        _permissions.HasPermissionAsync(_manager.Id, IdentityPermissions.Approvals.Approve, Arg.Any<CancellationToken>()).Returns(false);

        var ex = await Should.ThrowAsync<CustomException>(() => CreateSut().Handle(Command(), CancellationToken.None).AsTask());

        // Same answer as a wrong password, and the password isn't even tried.
        ex.Message.ShouldBe(IssueApprovalCommandHandler.InvalidCredentialsMessage);
        await _userManager.DidNotReceive().CheckPasswordAsync(Arg.Any<FshUser>(), Arg.Any<string>());
        _db.ApprovalGrants.ShouldBeEmpty();
    }

    [Fact]
    public async Task Handle_Should_Refuse_When_RequesterApprovesOwnRequest()
    {
        _currentUser.GetUserId().Returns(Guid.Parse(_manager.Id));

        var ex = await Should.ThrowAsync<CustomException>(() => CreateSut().Handle(Command(), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        _db.ApprovalGrants.ShouldBeEmpty();
    }

    [Fact]
    public void Validator_Should_Reject_UnknownAction_And_NegativeAmount()
    {
        var validator = new IssueApprovalCommandValidator();

        validator.Validate(Command()).IsValid.ShouldBeTrue();
        validator.Validate(Command() with { Action = "sale.anything" }).IsValid.ShouldBeFalse();
        validator.Validate(Command() with { Amount = -1m }).IsValid.ShouldBeFalse();
        validator.Validate(Command() with { Password = "" }).IsValid.ShouldBeFalse();
    }
}
