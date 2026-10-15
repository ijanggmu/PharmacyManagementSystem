using FSH.Framework.Core.Exceptions;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Identity.Contracts.v1.Tokens.ResolvePasswordLogin;
using FSH.Modules.Identity.Features.v1.Tokens.ResolvePasswordLogin;
using FSH.Modules.Multitenancy.Contracts.Dtos;
using FSH.Modules.Multitenancy.Contracts.v1.GetTenantByCode;
using Mediator;
using NSubstitute;
using NSubstitute.ExceptionExtensions;

namespace Identity.Tests.Handlers;

/// <summary>Sign-in without a pharmacy code: the pharmacies an email + password opens.</summary>
public sealed class ResolvePasswordLoginHandlerTests
{
    private readonly IIdentityService _identityService = Substitute.For<IIdentityService>();
    private readonly IMediator _mediator = Substitute.For<IMediator>();

    private ResolvePasswordLoginQueryHandler CreateHandler() => new(_identityService, _mediator);

    [Fact]
    public async Task Handle_Should_ReturnNoPharmacies_When_TheCredentialsMatchNone()
    {
        _identityService.FindPasswordLoginTenantsAsync("cashier@x.test", "wrong", Arg.Any<CancellationToken>()).Returns([]);

        var result = await CreateHandler().Handle(new ResolvePasswordLoginQuery("cashier@x.test", "wrong"), CancellationToken.None);

        result.Tenants.ShouldBeEmpty();
        await _mediator.DidNotReceiveWithAnyArgs().Send(default(GetTenantByCodeQuery)!, default);
    }

    [Fact]
    public async Task Handle_Should_ListActivePharmacies_InCodeOrder_AndSkipInactiveOnes()
    {
        _identityService.FindPasswordLoginTenantsAsync("owner@x.test", "right", Arg.Any<CancellationToken>())
            .Returns(["globex", "acme", "closed"]);
        _mediator.Send(new GetTenantByCodeQuery("acme"), Arg.Any<CancellationToken>()).Returns(new TenantLookupDto("Acme Pharmacy", "acme"));
        _mediator.Send(new GetTenantByCodeQuery("globex"), Arg.Any<CancellationToken>()).Returns(new TenantLookupDto(null, "globex"));
        _mediator.Send(new GetTenantByCodeQuery("closed"), Arg.Any<CancellationToken>()).Returns(new TenantLookupDto(null, null));

        var result = await CreateHandler().Handle(new ResolvePasswordLoginQuery("owner@x.test", "right"), CancellationToken.None);

        result.Tenants.Select(t => t.TenantId).ShouldBe(["acme", "globex"]);
        result.Tenants[0].TenantName.ShouldBe("Acme Pharmacy");
        result.Tenants[1].TenantName.ShouldBe("globex");
    }

    [Fact]
    public async Task Handle_Should_SkipAPharmacyTheLookupRefuses_AsClosed()
    {
        _identityService.FindPasswordLoginTenantsAsync("owner@x.test", "right", Arg.Any<CancellationToken>())
            .Returns(["acme", "closed"]);
        _mediator.Send(new GetTenantByCodeQuery("acme"), Arg.Any<CancellationToken>()).Returns(new TenantLookupDto("Acme Pharmacy", "acme"));
        _mediator.Send(new GetTenantByCodeQuery("closed"), Arg.Any<CancellationToken>())
            .ThrowsAsync(new NotFoundException("No active pharmacy uses this code."));

        var result = await CreateHandler().Handle(new ResolvePasswordLoginQuery("owner@x.test", "right"), CancellationToken.None);

        result.Tenants.Select(t => t.TenantId).ShouldBe(["acme"]);
    }

    [Fact]
    public void Validator_Should_RejectAMissingPasswordOrABadEmail()
    {
        var validator = new ResolvePasswordLoginQueryValidator();

        validator.Validate(new ResolvePasswordLoginQuery("not-an-email", "x")).IsValid.ShouldBeFalse();
        validator.Validate(new ResolvePasswordLoginQuery("a@b.test", "")).IsValid.ShouldBeFalse();
        validator.Validate(new ResolvePasswordLoginQuery("a@b.test", "x")).IsValid.ShouldBeTrue();
    }
}
