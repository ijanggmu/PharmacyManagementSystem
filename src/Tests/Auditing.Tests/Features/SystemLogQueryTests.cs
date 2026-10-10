using FSH.Modules.Auditing.Contracts;
using FSH.Modules.Auditing.Contracts.v1.GetActivityAudits;
using FSH.Modules.Auditing.Contracts.v1.SearchSecurityAudits;
using FSH.Modules.Auditing.Features.v1.Common;
using FSH.Modules.Auditing.Features.v1.GetActivityAudits;
using FSH.Modules.Auditing.Features.v1.SearchSecurityAudits;

namespace Auditing.Tests.Features;

public sealed class ClrTypeNamesTests
{
    private const string SaleCompleted =
        "FSH.Modules.Sales.Contracts.Events.SaleCompletedIntegrationEvent, FSH.Modules.Sales.Contracts, Version=10.0.0.0, Culture=neutral, PublicKeyToken=null";

    [Fact]
    public void ToShortName_Should_Strip_Namespace_Assembly_And_Suffix() =>
        ClrTypeNames.ToShortName(SaleCompleted).ShouldBe("SaleCompleted");

    [Fact]
    public void ToShortName_Can_Keep_Suffix() =>
        ClrTypeNames.ToShortName(SaleCompleted, stripIntegrationEventSuffix: false).ShouldBe("SaleCompletedIntegrationEvent");

    [Fact]
    public void ToShortName_Should_Render_Generic_Handlers()
    {
        const string handler =
            "FSH.Modules.Webhooks.Services.WebhookFanoutHandler`1[[FSH.Modules.Identity.Contracts.Events.TokenGeneratedIntegrationEvent, FSH.Modules.Identity.Contracts, Version=10.0.0.0, Culture=neutral, PublicKeyToken=null]]";

        ClrTypeNames.ToShortName(handler, stripIntegrationEventSuffix: false)
            .ShouldBe("WebhookFanoutHandler<TokenGeneratedIntegrationEvent>");
        ClrTypeNames.ModuleOf(handler).ShouldBe("Webhooks");
    }

    [Theory]
    [InlineData(null, "")]
    [InlineData("", "")]
    [InlineData("PlainName", "PlainName")]
    [InlineData("Outer+NestedIntegrationEvent", "Nested")]
    public void ToShortName_Edge_Cases(string? input, string expected) =>
        ClrTypeNames.ToShortName(input).ShouldBe(expected);

    [Fact]
    public void ModuleOf_Should_Read_Module_Segment()
    {
        ClrTypeNames.ModuleOf(SaleCompleted).ShouldBe("Sales");
        ClrTypeNames.ModuleOf("System.String").ShouldBeNull();
    }

    [Fact]
    public void StripAssembly_Should_Keep_Generic_Arguments()
    {
        ClrTypeNames.StripAssembly(SaleCompleted).ShouldBe("FSH.Modules.Sales.Contracts.Events.SaleCompletedIntegrationEvent");
        ClrTypeNames.StripAssembly("A`1[[B, AsmB]], AsmA").ShouldBe("A`1[[B, AsmB]]");
    }
}

public sealed class GetActivityAuditsQueryValidatorTests
{
    private readonly GetActivityAuditsQueryValidator _sut = new();

    [Fact]
    public void Empty_Query_Is_Valid() => _sut.Validate(new GetActivityAuditsQuery()).IsValid.ShouldBeTrue();

    [Theory]
    [InlineData("2xx")]
    [InlineData("4XX")]
    [InlineData("error")]
    public void Known_Status_Classes_Are_Valid(string statusClass) =>
        _sut.Validate(new GetActivityAuditsQuery { StatusClass = statusClass }).IsValid.ShouldBeTrue();

    [Fact]
    public void Unknown_Status_Class_Is_Invalid() =>
        _sut.Validate(new GetActivityAuditsQuery { StatusClass = "6xx" }).IsValid.ShouldBeFalse();

    [Fact]
    public void Unknown_Method_Is_Invalid() =>
        _sut.Validate(new GetActivityAuditsQuery { Method = "BREW" }).IsValid.ShouldBeFalse();

    [Fact]
    public void Window_Over_90_Days_Is_Invalid()
    {
        var now = DateTime.UtcNow;
        _sut.Validate(new GetActivityAuditsQuery { FromUtc = now.AddDays(-91), ToUtc = now }).IsValid.ShouldBeFalse();
    }

    [Fact]
    public void From_After_To_Is_Invalid()
    {
        var now = DateTime.UtcNow;
        _sut.Validate(new GetActivityAuditsQuery { FromUtc = now, ToUtc = now.AddHours(-1) }).IsValid.ShouldBeFalse();
    }

    [Fact]
    public void PageSize_Over_Limit_Is_Invalid() =>
        _sut.Validate(new GetActivityAuditsQuery { PageSize = 500 }).IsValid.ShouldBeFalse();

    [Fact]
    public void Negative_MinDuration_Is_Invalid() =>
        _sut.Validate(new GetActivityAuditsQuery { MinDurationMs = -1 }).IsValid.ShouldBeFalse();

    [Theory]
    [InlineData("2xx", 200, 299)]
    [InlineData("5xx", 500, 599)]
    [InlineData("error", 400, 599)]
    public void StatusClassRange_Maps_Classes(string statusClass, int min, int max) =>
        GetActivityAuditsQueryHandler.StatusClassRange(statusClass).ShouldBe((min, max));
}

public sealed class SearchAuditsQueryValidatorTests
{
    [Fact]
    public void Security_Search_Rejects_Undefined_Action() =>
        new SearchSecurityAuditsQueryValidator()
            .Validate(new SearchSecurityAuditsQuery { Action = (SecurityAction)99 })
            .IsValid.ShouldBeFalse();

    [Fact]
    public void Security_Search_Accepts_All_Defined_Actions()
    {
        var sut = new SearchSecurityAuditsQueryValidator();
        foreach (var action in Enum.GetValues<SecurityAction>())
        {
            sut.Validate(new SearchSecurityAuditsQuery { Action = action }).IsValid.ShouldBeTrue();
        }
    }

    [Fact]
    public void Exception_Search_Rejects_Inverted_Window()
    {
        var now = DateTime.UtcNow;
        new SearchExceptionAuditsQueryValidator()
            .Validate(new SearchExceptionAuditsQuery { FromUtc = now, ToUtc = now.AddDays(-1) })
            .IsValid.ShouldBeFalse();
    }
}
