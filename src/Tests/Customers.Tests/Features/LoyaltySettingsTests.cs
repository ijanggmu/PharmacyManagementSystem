using FSH.Framework.Core.Exceptions;
using FSH.Modules.Customers.Contracts.Loyalty;
using FSH.Modules.Customers.Contracts.v1.Loyalty;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.Features.v1.Loyalty.AdjustLoyaltyPoints;
using FSH.Modules.Customers.Features.v1.Loyalty.GetCustomerLoyalty;
using FSH.Modules.Reference.Contracts.v1.TenantSettings;
using Mediator;
using NSubstitute;

namespace Customers.Tests.Features;

public sealed class LoyaltySettingsTests : IDisposable
{
    private readonly CustomersDbContext _db = CustomersDbContextFactory.Create();

    [Fact]
    public void Missing_Settings_Mean_The_Programme_Is_Off()
    {
        var settings = LoyaltySettings.From(new Dictionary<string, string>());
        settings.Enabled.ShouldBeFalse();
        settings.PointsEarnedOn(10_000m).ShouldBe(0);
    }

    [Fact]
    public void Settings_Should_Parse_And_Ignore_Bad_Values()
    {
        var settings = LoyaltySettings.From(new Dictionary<string, string>
        {
            ["LOYALTY.ENABLED"] = "True",
            ["loyalty.amount_per_point"] = "50",
            ["loyalty.point_value"] = "0.5",
            ["loyalty.member_discount_percent"] = "250",
            ["loyalty.min_redeem_points"] = "abc",
        });

        settings.Enabled.ShouldBeTrue();
        settings.PointsEarnedOn(149m).ShouldBe(2);
        settings.ValueOf(30).ShouldBe(15m);
        settings.MemberDiscountPercent.ShouldBe(100m);
        settings.MinRedeemPoints.ShouldBe(0);
    }

    [Fact]
    public async Task Adjust_Should_Record_The_Change_And_Return_The_Balance()
    {
        var customer = Customer.Create("Ram", null, null, null, 0m, "C-000001");
        _db.Customers.Add(customer);
        await _db.SaveChangesAsync();

        var balance = await new AdjustLoyaltyPointsCommandHandler(_db)
            .Handle(new AdjustLoyaltyPointsCommand(customer.Id, 25, "Welcome bonus"), CancellationToken.None);

        balance.ShouldBe(25);
        _db.CustomerLoyaltyEntries.ShouldHaveSingleItem().Description.ShouldBe("Welcome bonus");
    }

    [Fact]
    public async Task GetCustomerLoyalty_Should_Value_The_Points()
    {
        var customer = Customer.Create("Ram", null, null, null, 0m, "C-000001");
        customer.SetMembership(true);
        customer.ApplyLoyaltyPoints(80, out _);
        _db.Customers.Add(customer);
        await _db.SaveChangesAsync();
        var mediator = Substitute.For<IMediator>();
        mediator.Send(Arg.Any<GetTenantSettingsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new Dictionary<string, string> { ["loyalty.enabled"] = "true", ["loyalty.point_value"] = "0.5" });

        var dto = await new GetCustomerLoyaltyQueryHandler(_db, mediator)
            .Handle(new GetCustomerLoyaltyQuery(customer.Id), CancellationToken.None);

        dto.IsMember.ShouldBeTrue();
        dto.Points.ShouldBe(80);
        dto.PointsValue.ShouldBe(40m);
    }

    [Fact]
    public async Task GetCustomerLoyalty_Should_404_For_An_Unknown_Customer()
    {
        await Should.ThrowAsync<NotFoundException>(() => new GetCustomerLoyaltyQueryHandler(_db, Substitute.For<IMediator>())
            .Handle(new GetCustomerLoyaltyQuery(Guid.CreateVersion7()), CancellationToken.None).AsTask());
    }

    public void Dispose() => _db.Dispose();
}
