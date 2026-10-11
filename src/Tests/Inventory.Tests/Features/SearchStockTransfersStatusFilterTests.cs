using FSH.Modules.Inventory.Contracts.v1.StockTransfers;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Features.v1.StockTransfers.SearchStockTransfers;
using FSH.Modules.Multitenancy.Contracts;
using NSubstitute;

namespace Inventory.Tests.Features;

/// <summary>The stock-transfer list's status filter: the web app sends snake_case ("in_transit"), which
/// a plain Enum.TryParse could not parse, so the filter used to be silently ignored.</summary>
public sealed class SearchStockTransfersStatusFilterTests : IDisposable
{
    private readonly InventoryDbContext _db = InventoryDbContextFactory.Create();

    private static ICurrentBranch NoCurrentBranch()
    {
        var branch = Substitute.For<ICurrentBranch>();
        branch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0));
        return branch;
    }

    [Theory]
    [InlineData("in_transit", StockTransferStatus.InTransit)]
    [InlineData("InTransit", StockTransferStatus.InTransit)]
    [InlineData("in-transit", StockTransferStatus.InTransit)]
    [InlineData("completed", StockTransferStatus.Completed)]
    [InlineData("CANCELLED", StockTransferStatus.Cancelled)]
    public void TryParse_Should_Accept_Names_And_SnakeCase(string value, StockTransferStatus expected)
    {
        StockTransferStatusFilter.TryParse(value, out var status).ShouldBeTrue();
        status.ShouldBe(expected);
    }

    [Theory]
    [InlineData(null)]
    [InlineData(" ")]
    [InlineData("shipped")]
    [InlineData("1")]
    [InlineData("_")]
    public void TryParse_Should_Reject_Unknown_Values(string? value)
    {
        StockTransferStatusFilter.TryParse(value, out _).ShouldBeFalse();
    }

    [Fact]
    public void Validator_Should_Reject_Unknown_Status()
    {
        var validator = new SearchStockTransfersQueryValidator();

        validator.Validate(new SearchStockTransfersQuery(Status: "shipped")).IsValid.ShouldBeFalse();
        validator.Validate(new SearchStockTransfersQuery(Status: "in_transit")).IsValid.ShouldBeTrue();
    }

    [Fact]
    public async Task Handle_Should_Filter_By_SnakeCase_Status()
    {
        var medicineId = Guid.CreateVersion7();
        var open = StockTransfer.Create(Guid.CreateVersion7(), Guid.CreateVersion7(), Guid.CreateVersion7(), null, [(medicineId, 5m)]);
        var cancelled = StockTransfer.Create(Guid.CreateVersion7(), Guid.CreateVersion7(), Guid.CreateVersion7(), null, [(medicineId, 3m)]);
        cancelled.Cancel(Guid.CreateVersion7(), "Wrong branch");
        _db.StockTransfers.Add(open);
        _db.StockTransfers.Add(cancelled);
        await _db.SaveChangesAsync(CancellationToken.None);

        var handler = new SearchStockTransfersQueryHandler(_db, NoCurrentBranch());
        var inTransit = await handler.Handle(new SearchStockTransfersQuery(Status: "in_transit"), CancellationToken.None);
        var cancelledOnly = await handler.Handle(new SearchStockTransfersQuery(Status: "cancelled"), CancellationToken.None);

        inTransit.Items.ShouldHaveSingleItem().Id.ShouldBe(open.Id);
        cancelledOnly.Items.ShouldHaveSingleItem().Id.ShouldBe(cancelled.Id);
    }

    public void Dispose() => _db.Dispose();
}
