using FluentValidation.TestHelper;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Multitenancy.Contracts.Dtos;
using FSH.Modules.Multitenancy.Contracts.v1.CreateTenant;
using FSH.Modules.Multitenancy.Contracts.v1.SignUpTenant;
using FSH.Modules.Multitenancy.Contracts.v1.TenantProvisioning;
using FSH.Modules.Multitenancy.Features.v1.SignUpTenant;
using Mediator;
using NSubstitute;

namespace Multitenancy.Tests.Handlers;

public sealed class SignUpTenantCommandHandlerTests
{
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly IGoogleIdTokenValidator _googleTokens = Substitute.For<IGoogleIdTokenValidator>();
    private readonly ITenantAdminProfileStaging _staging = Substitute.For<ITenantAdminProfileStaging>();

    public SignUpTenantCommandHandlerTests()
    {
        _mediator.Send(Arg.Any<CreateTenantCommand>(), Arg.Any<CancellationToken>())
            .Returns(new CreateTenantCommandResponse("sunrise", "corr-1", "Pending"));
    }

    private SignUpTenantCommandHandler CreateHandler() => new(_mediator, _googleTokens, _staging);

    private static SignUpTenantCommand Command(string? password = "Sunrise2026", string? googleIdToken = null) => new(
        PharmacyName: "Sunrise Pharmacy",
        Slug: "sunrise",
        AdminFirstName: "Asha",
        AdminLastName: "Rai",
        AdminEmail: "owner@sunrise.com",
        AdminPassword: password,
        AdminConfirmPassword: password,
        PhoneNumber: "+977 9800000000",
        GoogleIdToken: googleIdToken);

    [Fact]
    public async Task Handle_Should_StageNameAndPhone_AndCreateTenantWithThePassword()
    {
        var result = await CreateHandler().Handle(Command(), CancellationToken.None);

        result.ShouldBe(new SignUpTenantCommandResponse("sunrise", "corr-1", "Pending"));
        await _staging.Received(1).StageAsync(
            Arg.Is<StagedTenantAdminProfile>(p =>
                p.TenantId == "sunrise" && p.FirstName == "Asha" && p.LastName == "Rai" && p.PhoneNumber == "+977 9800000000"
                && p.ExternalLoginProvider == null),
            Arg.Any<CancellationToken>());
        await _mediator.Received(1).Send(
            Arg.Is<CreateTenantCommand>(c => c.AdminPassword == "Sunrise2026" && c.AdminEmail == "owner@sunrise.com"),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_Should_StageTheGoogleLogin_AndUseAGeneratedPassword_ForAGoogleSignUp()
    {
        _googleTokens.ValidateAsync("g-token", Arg.Any<CancellationToken>())
            .Returns(new GoogleIdentity("google-sub-1", "Owner@Sunrise.com", true, "Asha", "Rai", null, null));

        await CreateHandler().Handle(Command(password: null, googleIdToken: "g-token"), CancellationToken.None);

        await _staging.Received(1).StageAsync(
            Arg.Is<StagedTenantAdminProfile>(p => p.ExternalLoginProvider == "Google" && p.ExternalProviderKey == "google-sub-1"),
            Arg.Any<CancellationToken>());
        await _mediator.Received(1).Send(
            Arg.Is<CreateTenantCommand>(c => c.AdminPassword != null && c.AdminPassword.Length == 32),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_Should_Reject_GoogleAccountWithADifferentOrUnverifiedEmail()
    {
        _googleTokens.ValidateAsync("other", Arg.Any<CancellationToken>())
            .Returns(new GoogleIdentity("google-sub-2", "someone@else.com", true, null, null, null, null));
        _googleTokens.ValidateAsync("unverified", Arg.Any<CancellationToken>())
            .Returns(new GoogleIdentity("google-sub-3", "owner@sunrise.com", false, null, null, null, null));

        await Should.ThrowAsync<CustomException>(() => CreateHandler().Handle(Command(null, "other"), CancellationToken.None).AsTask());
        await Should.ThrowAsync<CustomException>(() => CreateHandler().Handle(Command(null, "unverified"), CancellationToken.None).AsTask());
        await _staging.DidNotReceiveWithAnyArgs().StageAsync(default!, default);
        await _mediator.DidNotReceiveWithAnyArgs().Send(default(CreateTenantCommand)!, default);
    }

    [Fact]
    public void GeneratePassword_Should_MeetTheIdentityPolicy()
    {
        for (int i = 0; i < 50; i++)
        {
            string password = SignUpTenantCommandHandler.GeneratePassword();
            password.Length.ShouldBe(32);
            password.ShouldMatch("[A-Z]");
            password.ShouldMatch("[a-z]");
            password.ShouldMatch("[0-9]");
        }
    }
}

public sealed class SignUpTenantCommandValidatorTests
{
    private readonly SignUpTenantCommandValidator _validator = new();

    private static SignUpTenantCommand Command(string? password, string? confirm, string? googleIdToken = null) =>
        new("Sunrise Pharmacy", "sunrise", "Asha", "Rai", "owner@sunrise.com", password, confirm, null, googleIdToken);

    [Theory]
    [InlineData("Pass1234")]        // 8 characters — below Identity's 10
    [InlineData("password2026")]    // no uppercase
    [InlineData("PASSWORD2026")]    // no lowercase
    [InlineData("PasswordOnly")]    // no digit
    public void Should_Reject_PasswordsTheIdentityPolicyRejects(string password)
    {
        _validator.TestValidate(Command(password, password)).ShouldHaveValidationErrorFor(c => c.AdminPassword);
    }

    [Fact]
    public void Should_Accept_APolicyPassword()
    {
        _validator.TestValidate(Command("Sunrise2026", "Sunrise2026")).ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public void Should_NotRequireAPassword_ForAGoogleSignUp()
    {
        _validator.TestValidate(Command(null, null, "g-token")).ShouldNotHaveAnyValidationErrors();
    }
}

public sealed class SignUpHelperHandlerTests
{
    [Fact]
    public async Task Status_Should_HideTheTenant_When_TheCorrelationIdDoesNotMatch()
    {
        var mediator = Substitute.For<IMediator>();
        mediator.Send(new GetTenantProvisioningStatusQuery("sunrise"), Arg.Any<CancellationToken>())
            .Returns(new TenantProvisioningStatusDto("sunrise", "Running", "corr-1", "Seeding", "boom", DateTime.UtcNow, null, null,
                [new TenantProvisioningStepDto("Database", "Completed", null, null, null)]));
        var handler = new GetSignUpStatusQueryHandler(mediator);

        await Should.ThrowAsync<NotFoundException>(
            () => handler.Handle(new GetSignUpStatusQuery("sunrise", "wrong"), CancellationToken.None).AsTask());

        var status = await handler.Handle(new GetSignUpStatusQuery("sunrise", "corr-1"), CancellationToken.None);
        status.Status.ShouldBe("Running");
        status.Error.ShouldBeNull(); // internal errors are never shown unless the run failed
        status.Steps.ShouldHaveSingleItem().Step.ShouldBe("Database");
    }

    [Fact]
    public async Task Availability_Should_CheckCodeAndName()
    {
        var tenants = Substitute.For<ITenantService>();
        tenants.ExistsWithIdAsync("taken", Arg.Any<CancellationToken>()).Returns(true);
        tenants.ExistsWithNameAsync("Sunrise Pharmacy", Arg.Any<CancellationToken>()).Returns(true);
        var handler = new CheckSignUpAvailabilityQueryHandler(tenants);

        var free = await handler.Handle(new CheckSignUpAvailabilityQuery("fresh-code", "New Pharmacy"), CancellationToken.None);
        free.SlugAvailable.ShouldBe(true);
        free.NameAvailable.ShouldBe(true);

        var taken = await handler.Handle(new CheckSignUpAvailabilityQuery("taken", "Sunrise Pharmacy"), CancellationToken.None);
        taken.SlugAvailable.ShouldBe(false);
        taken.NameAvailable.ShouldBe(false);

        (await handler.Handle(new CheckSignUpAvailabilityQuery("admin", null), CancellationToken.None)).SlugAvailable.ShouldBe(false);
        (await handler.Handle(new CheckSignUpAvailabilityQuery("Bad Code", null), CancellationToken.None)).SlugAvailable.ShouldBe(false);
    }
}
