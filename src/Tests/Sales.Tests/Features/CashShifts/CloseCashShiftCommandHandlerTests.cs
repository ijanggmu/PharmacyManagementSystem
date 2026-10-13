using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Events;
using FSH.Modules.Sales.Contracts.v1.CashShifts;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.CashShifts.CloseCashShift;
using NSubstitute;
using Shouldly;
using Xunit;

namespace Sales.Tests.Features.CashShifts;

/// <summary>Closing a shift whose count differs from the expected cash tells Accounting about the short/over;
/// a balanced drawer publishes nothing.</summary>
public sealed class CloseCashShiftCommandHandlerTests : IDisposable
{
    private readonly SalesDbContext _db = SalesDbContextFactory.Create();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly Guid _branchId = Guid.CreateVersion7();

    public CloseCashShiftCommandHandlerTests()
    {
        _currentUser.Name.Returns("cashier");
        _currentUser.GetTenant().Returns("test-tenant");
    }

    public void Dispose() => _db.Dispose();

    private CloseCashShiftCommandHandler Handler() =>
        new(_db, _outbox, _currentUser, _currentBranch, Substitute.For<Mediator.IMediator>());

    /// <summary>A shift with a 1000 float and one 250 cash sale: 1250 expected in the drawer.</summary>
    private async Task<CashShift> SeedShiftAsync()
    {
        var shift = CashShift.Open(_branchId, "cashier", 1000m, null);
        _db.CashShifts.Add(shift);
        var sale = Sale.StartBuilding(_branchId, null, null, null);
        sale.AddItem(Guid.CreateVersion7(), 1m, 250m, 0m, 0m, 100m);
        sale.Finalize("Cash", 250m);
        _db.Sales.Add(sale);
        await _db.SaveChangesAsync();
        return shift;
    }

    [Theory]
    [InlineData("1230.50", "-19.50")]
    [InlineData("1260", "10")]
    public async Task Close_Should_PublishVarianceEvent_When_CountDiffersFromExpected(string countedText, string varianceText)
    {
        decimal counted = decimal.Parse(countedText, System.Globalization.CultureInfo.InvariantCulture);
        decimal expectedVariance = decimal.Parse(varianceText, System.Globalization.CultureInfo.InvariantCulture);
        var shift = await SeedShiftAsync();

        await Handler().Handle(new CloseCashShiftCommand(shift.Id, counted, null), CancellationToken.None);

        await _outbox.Received(1).AddAsync(
            Arg.Is<CashShiftClosedWithVarianceIntegrationEvent>(e =>
                e.CashShiftId == shift.Id
                && e.BranchId == _branchId
                && e.TenantId == "test-tenant"
                && e.Source == "Sales"
                && e.ExpectedCash == 1250m
                && e.CountedCash == counted
                && e.Variance == expectedVariance
                && e.ClosedBy == "cashier"
                && e.ClosedAtUtc == shift.ClosedAtUtc
                && e.OpenedAtUtc == shift.OpenedAtUtc),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Close_Should_PublishNothing_When_DrawerBalances()
    {
        var shift = await SeedShiftAsync();

        await Handler().Handle(new CloseCashShiftCommand(shift.Id, 1250m, null), CancellationToken.None);

        shift.GetClosingVariance().ShouldBe(0m);
        await _outbox.DidNotReceiveWithAnyArgs().AddAsync(default!, default);
    }
}
