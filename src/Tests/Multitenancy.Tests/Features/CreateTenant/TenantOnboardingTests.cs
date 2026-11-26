using FSH.Framework.Persistence;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Multitenancy.Contracts.v1.CreateTenant;
using FSH.Modules.Multitenancy.Features.v1.CreateTenant;
using FSH.Modules.Multitenancy.Services;
using NSubstitute;

namespace Multitenancy.Tests.Features.CreateTenant;

public sealed class TenantSlugTests
{
    [Theory]
    [InlineData("Shree Ram Pharmacy", "shree-ram-pharmacy")]
    [InlineData("  Shree   Ram -- Pharmacy & Clinic! ", "shree-ram-pharmacy-clinic")]
    [InlineData("Café Médica", "cafe-medica")]
    [InlineData("24x7 Pharmacy", "24x7-pharmacy")]
    [InlineData("श्री राम फार्मेसी", "pharmacy")]
    [InlineData("", "pharmacy")]
    [InlineData("A", "pharmacy")]
    public void FromName_Should_BuildLowercaseHyphenSlug(string name, string expected) =>
        TenantSlug.FromName(name).ShouldBe(expected);

    [Fact]
    public void FromName_Should_CapAtMaxLength_WithoutTrailingHyphen()
    {
        string slug = TenantSlug.FromName("Very Long Pharmacy Name That Keeps Going And Going Forever");
        slug.Length.ShouldBeLessThanOrEqualTo(TenantSlug.MaxLength);
        slug.ShouldNotEndWith("-");
    }

    [Fact]
    public async Task GenerateUnique_Should_ReturnBaseSlug_WhenFree()
    {
        string code = await TenantSlug.GenerateUniqueAsync("Shree Ram Pharmacy", (_, _) => Task.FromResult(false));
        code.ShouldBe("shree-ram-pharmacy");
    }

    [Fact]
    public async Task GenerateUnique_Should_AppendNumber_WhenTaken()
    {
        var taken = new HashSet<string> { "shree-ram-pharmacy", "shree-ram-pharmacy-2" };
        string code = await TenantSlug.GenerateUniqueAsync("Shree Ram Pharmacy", (s, _) => Task.FromResult(taken.Contains(s)));
        code.ShouldBe("shree-ram-pharmacy-3");
    }

    [Fact]
    public async Task GenerateUnique_Should_SkipReservedSlugs()
    {
        string code = await TenantSlug.GenerateUniqueAsync("Admin", (_, _) => Task.FromResult(false));
        code.ShouldBe("admin-2");
    }

    [Fact]
    public async Task GenerateUnique_Should_KeepSuffixWithinMaxLength()
    {
        string name = new('a', 60);
        string code = await TenantSlug.GenerateUniqueAsync(name, (s, _) => Task.FromResult(s == new string('a', 40)));
        code.Length.ShouldBeLessThanOrEqualTo(TenantSlug.MaxLength);
        code.ShouldEndWith("-2");
    }
}

public sealed class CreateTenantCommandValidatorTests
{
    private readonly ITenantService _tenants = Substitute.For<ITenantService>();
    private readonly CreateTenantCommandValidator _sut;

    public CreateTenantCommandValidatorTests()
    {
        var connections = Substitute.For<IConnectionStringValidator>();
        _sut = new CreateTenantCommandValidator(_tenants, connections);
    }

    private static CreateTenantCommand Command(string? id = null, string name = "Shree Ram Pharmacy", string email = "owner@example.com", string password = "Str0ngPassw0rd") =>
        new(id, name, null, email, password, null);

    [Fact]
    public async Task Should_Pass_WithoutId_AndStrongPassword()
    {
        var result = await _sut.ValidateAsync(Command());
        result.IsValid.ShouldBeTrue();
    }

    [Theory]
    [InlineData("short1A")]          // too short
    [InlineData("alllowercase123")]  // no uppercase
    [InlineData("ALLUPPERCASE123")]  // no lowercase
    [InlineData("NoDigitsHereAtAll")] // no digit
    public async Task Should_Fail_WhenPasswordBreaksPolicy(string password)
    {
        var result = await _sut.ValidateAsync(Command(password: password));
        result.Errors.ShouldContain(e => e.PropertyName == nameof(CreateTenantCommand.AdminPassword));
    }

    [Theory]
    [InlineData("Bad_Code")]
    [InlineData("-leading")]
    [InlineData("admin")]
    public async Task Should_Fail_WhenSuppliedIdIsInvalidOrReserved(string id)
    {
        var result = await _sut.ValidateAsync(Command(id: id));
        result.Errors.ShouldContain(e => e.PropertyName == nameof(CreateTenantCommand.Id));
    }

    [Fact]
    public async Task Should_Fail_WhenNameAlreadyExists()
    {
        _tenants.ExistsWithNameAsync("Shree Ram Pharmacy", Arg.Any<CancellationToken>()).Returns(true);
        var result = await _sut.ValidateAsync(Command());
        result.Errors.ShouldContain(e => e.PropertyName == nameof(CreateTenantCommand.Name));
    }

    [Theory]
    [InlineData("")]
    [InlineData("not-an-email")]
    public async Task Should_Fail_WhenEmailInvalid(string email)
    {
        var result = await _sut.ValidateAsync(Command(email: email));
        result.Errors.ShouldContain(e => e.PropertyName == nameof(CreateTenantCommand.AdminEmail));
    }
}

public sealed class TenantWelcomeEmailTests
{
    [Fact]
    public void Build_Should_IncludeDetails_AndEncodeHtml()
    {
        var (subject, body) = TenantWelcomeEmail.Build(new TenantWelcomeEmail.Details(
            PharmacyName: "Ram <b>Pharmacy</b>",
            TenantCode: "ram-pharmacy",
            SignInUrl: "https://pharmacare.example/t/ram-pharmacy/login",
            AdminEmail: "owner@example.com",
            AdminPassword: "Pa<ss>w0rdX",
            Plan: "trial",
            ValidUpto: new DateTime(2027, 1, 15, 0, 0, 0, DateTimeKind.Utc)));

        subject.ShouldContain("PharmaCare");
        body.ShouldContain("ram-pharmacy");
        body.ShouldContain("owner@example.com");
        body.ShouldContain("Pa&lt;ss&gt;w0rdX");
        body.ShouldContain("Ram &lt;b&gt;Pharmacy&lt;/b&gt;");
        body.ShouldNotContain("<b>Pharmacy</b>");
        body.ShouldContain("January 15, 2027");
    }
}

public sealed class MailAvailabilityTests
{
    [Fact]
    public void Should_BeOff_WhenNothingConfigured() =>
        MailAvailability.IsConfigured(new FSH.Framework.Mailing.MailOptions()).ShouldBeFalse();

    [Fact]
    public void Should_BeOff_ForProductionDefaults() =>
        MailAvailability.IsConfigured(new FSH.Framework.Mailing.MailOptions { From = "", Smtp = new() { Host = "" } }).ShouldBeFalse();

    [Fact]
    public void Should_BeOn_WithSmtpHostAndFrom() =>
        MailAvailability.IsConfigured(new FSH.Framework.Mailing.MailOptions { From = "no-reply@pharmacare.example", Smtp = new() { Host = "smtp.example.com", Port = 587 } }).ShouldBeTrue();

    [Fact]
    public void Should_FollowSendGridKey_WhenSendGridSelected()
    {
        MailAvailability.IsConfigured(new FSH.Framework.Mailing.MailOptions { UseSendGrid = true, SendGrid = new() { ApiKey = "" } }).ShouldBeFalse();
        MailAvailability.IsConfigured(new FSH.Framework.Mailing.MailOptions { UseSendGrid = true, SendGrid = new() { ApiKey = "SG.key" } }).ShouldBeTrue();
    }
}
