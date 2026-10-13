using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Reference.Contracts.v1.TenantSettings;
using FSH.Modules.Sales.Contracts.v1.ParkedSales;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Features.v1.ParkedSales;
using Mediator;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Shouldly;
using Xunit;

namespace Sales.Tests.Features.ParkedSales;

/// <summary>Hold / recall of POS bills: per branch, consumed on recall, lapsing after the tenant's expiry setting, and
/// never touching stock or the ledger (the handlers have no stock or outbox dependency at all).</summary>
public sealed class ParkedSaleHandlersTests : IDisposable
{
    private readonly string _database = Guid.NewGuid().ToString();
    private readonly SalesDbContext _db;
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly ICurrentUser _user = Substitute.For<ICurrentUser>();
    private readonly ClockStub _clock = new(new DateTimeOffset(2026, 10, 13, 8, 0, 0, TimeSpan.Zero));
    private readonly Guid _branchA = Guid.CreateVersion7();
    private readonly Guid _branchB = Guid.CreateVersion7();

    public ParkedSaleHandlersTests()
    {
        _db = SalesDbContextFactory.Create(_database);
        _user.GetUserId().Returns(Guid.CreateVersion7());
        _user.Name.Returns("Sita Cashier");
        StubExpiryHours(null);
    }

    public void Dispose() => _db.Dispose();

    private void StubExpiryHours(string? hours) =>
        _mediator.Send(Arg.Any<GetTenantSettingsQuery>(), Arg.Any<CancellationToken>())
            .Returns(hours is null
                ? new Dictionary<string, string>()
                : new Dictionary<string, string> { [ParkedSaleSettings.ExpiryHoursKey] = hours });

    private static ICurrentBranch Branch(Guid id)
    {
        var branch = Substitute.For<ICurrentBranch>();
        branch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(id);
        return branch;
    }

    /// <summary>A fresh context per call, like a fresh request on another terminal.</summary>
    private SalesDbContext NewContext() => SalesDbContextFactory.Create(_database);

    private static ParkSaleCommand Cart(string label = "Ram's bill", string? key = null) => new(
        label,
        [
            new ParkedSaleLineDto(Guid.CreateVersion7(), "Paracetamol 500mg", 20m, "pack", 2, 5m, 1.13m, 21.47m),
            new ParkedSaleLineDto(Guid.CreateVersion7(), "ORS sachet", 3m, null, null, 0m, 20m, 60m),
        ],
        TotalAmount: 81.47m,
        CustomerId: Guid.CreateVersion7(),
        CustomerName: "Ram Thapa",
        PriceLevelId: Guid.CreateVersion7(),
        BuyerName: "Thapa Traders",
        BuyerPan: "123456789",
        BillDiscountAmount: 2m,
        ClientParkId: key);

    private async Task<ParkedSaleSummaryDto> ParkAsync(Guid branchId, ParkSaleCommand command)
    {
        using var db = NewContext();
        return await new ParkSaleCommandHandler(db, Branch(branchId), _user, _mediator, _clock).Handle(command, CancellationToken.None);
    }

    private async Task<IReadOnlyList<ParkedSaleSummaryDto>> ListAsync(Guid branchId)
    {
        using var db = NewContext();
        return await new GetParkedSalesQueryHandler(db, Branch(branchId), _clock).Handle(new GetParkedSalesQuery(), CancellationToken.None);
    }

    private async Task<ParkedSaleDto> RecallAsync(Guid branchId, Guid id)
    {
        using var db = NewContext();
        return await new RecallParkedSaleCommandHandler(db, Branch(branchId), _clock).Handle(new RecallParkedSaleCommand(id), CancellationToken.None);
    }

    [Fact]
    public async Task Park_Keeps_The_Whole_Cart_And_Lists_It_At_The_Branch_Only()
    {
        var parked = await ParkAsync(_branchA, Cart());

        parked.Label.ShouldBe("Ram's bill");
        parked.LineCount.ShouldBe(2);
        parked.TotalAmount.ShouldBe(81.47m);
        parked.ParkedByName.ShouldBe("Sita Cashier");
        parked.ExpiresAtUtc.ShouldBe(_clock.GetUtcNow().UtcDateTime.AddHours(24));

        (await ListAsync(_branchA)).Select(p => p.Id).ShouldBe([parked.Id]);
        (await ListAsync(_branchB)).ShouldBeEmpty();
    }

    [Fact]
    public async Task Recall_Restores_Lines_Pack_Units_Customer_Level_Buyer_And_Discount_Then_Takes_It_Off_Hold()
    {
        var command = Cart();
        var parked = await ParkAsync(_branchA, command);

        var recalled = await RecallAsync(_branchA, parked.Id);

        recalled.Lines.ShouldBe(command.Lines);
        recalled.Lines[0].SaleUnit.ShouldBe("pack");
        recalled.Lines[0].PackCount.ShouldBe(2);
        (recalled.CustomerId, recalled.PriceLevelId, recalled.BuyerName, recalled.BuyerPan, recalled.BillDiscountAmount)
            .ShouldBe((command.CustomerId, command.PriceLevelId, "Thapa Traders", "123456789", 2m));
        (await ListAsync(_branchA)).ShouldBeEmpty();

        // A second terminal recalling the same bill finds it gone.
        await Should.ThrowAsync<NotFoundException>(async () => await RecallAsync(_branchA, parked.Id));
    }

    [Fact]
    public async Task Another_Branch_Cannot_Recall_It()
    {
        var parked = await ParkAsync(_branchA, Cart());
        await Should.ThrowAsync<NotFoundException>(async () => await RecallAsync(_branchB, parked.Id));
        (await ListAsync(_branchA)).Count.ShouldBe(1);
    }

    [Fact]
    public async Task Parked_Bills_Expire_After_The_Tenant_Setting_And_Are_Purged()
    {
        StubExpiryHours("2");
        var parked = await ParkAsync(_branchA, Cart());
        parked.ExpiresAtUtc.ShouldBe(_clock.GetUtcNow().UtcDateTime.AddHours(2));

        _clock.Advance(TimeSpan.FromHours(1));
        (await ListAsync(_branchA)).Count.ShouldBe(1);

        _clock.Advance(TimeSpan.FromHours(1));
        (await ListAsync(_branchA)).ShouldBeEmpty();
        using (var db = NewContext())
        {
            (await db.ParkedSales.CountAsync()).ShouldBe(0);
        }

        await Should.ThrowAsync<NotFoundException>(async () => await RecallAsync(_branchA, parked.Id));
    }

    [Fact]
    public async Task Recalling_An_Expired_Bill_Before_It_Is_Purged_Is_Refused()
    {
        var parked = await ParkAsync(_branchA, Cart());
        _clock.Advance(TimeSpan.FromHours(25));
        await Should.ThrowAsync<NotFoundException>(async () => await RecallAsync(_branchA, parked.Id));
    }

    [Theory]
    [InlineData("abc", 24)]
    [InlineData("0", 24)]
    [InlineData("8", 8)]
    [InlineData("100000", 720)]
    public void Expiry_Setting_Defaults_To_24_Hours_And_Is_Capped_At_30_Days(string value, int expectedHours) =>
        ParkedSaleSettings.LifetimeFrom(new Dictionary<string, string> { [ParkedSaleSettings.ExpiryHoursKey] = value })
            .ShouldBe(TimeSpan.FromHours(expectedHours));

    [Fact]
    public async Task A_Retried_Park_With_The_Same_Key_Shelves_The_Cart_Once()
    {
        var first = await ParkAsync(_branchA, Cart(key: "park-1"));
        var retry = await ParkAsync(_branchA, Cart(key: "park-1"));
        retry.Id.ShouldBe(first.Id);
        (await ListAsync(_branchA)).Count.ShouldBe(1);
    }

    [Fact]
    public async Task Discard_Removes_It_And_An_Empty_Cart_Cannot_Be_Parked()
    {
        var parked = await ParkAsync(_branchA, Cart());
        using (var db = NewContext())
        {
            await new DiscardParkedSaleCommandHandler(db, Branch(_branchA)).Handle(new DiscardParkedSaleCommand(parked.Id), CancellationToken.None);
        }

        (await ListAsync(_branchA)).ShouldBeEmpty();
        await Should.ThrowAsync<CustomException>(async () => await ParkAsync(_branchA, Cart() with { Lines = [] }));
    }

    [Fact]
    public void Validator_Requires_Lines_And_Known_Sale_Units()
    {
        var validator = new ParkSaleCommandValidator();
        validator.Validate(Cart()).IsValid.ShouldBeTrue();
        validator.Validate(Cart() with { Lines = [] }).IsValid.ShouldBeFalse();
        validator.Validate(Cart() with
        {
            Lines = [new ParkedSaleLineDto(Guid.CreateVersion7(), "X", 1m, "box", null, 0m, 1m, 1m)],
        }).IsValid.ShouldBeFalse();
    }

    private sealed class ClockStub(DateTimeOffset start) : TimeProvider
    {
        private DateTimeOffset _now = start;

        public override DateTimeOffset GetUtcNow() => _now;

        public void Advance(TimeSpan by) => _now += by;
    }
}
