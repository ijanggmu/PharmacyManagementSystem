using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.v1.DirectGoodsReceipts;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using FSH.Modules.Purchasing.Features.v1.DirectGoodsReceipts.ListDirectGoodsReceipts;
using NSubstitute;
using Purchasing.Tests.Features;

namespace Purchasing.Tests.Features.DirectGoodsReceipts;

public sealed class ListDirectGoodsReceiptsQueryHandlerTests : IDisposable
{
    private readonly PurchasingDbContext _db = PurchasingDbContextFactory.Create();
    private readonly ListDirectGoodsReceiptsQueryHandler _sut;

    public ListDirectGoodsReceiptsQueryHandlerTests()
    {
        // No tenant branch resolved: an omitted branchId must stay unfiltered (see
        // ListDirectGoodsReceiptsDefaultBranchTests for the current-branch default).
        var currentBranch = Substitute.For<ICurrentBranch>();
        currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0));
        _sut = new ListDirectGoodsReceiptsQueryHandler(_db, currentBranch, NamesMediator.Create());
    }

    private async Task<(Guid BranchA, Guid BranchB)> SeedTwoBranchesAsync()
    {
        var branchA = Guid.CreateVersion7();
        var branchB = Guid.CreateVersion7();

        var receiptA = DirectGoodsReceipt.Create(Guid.CreateVersion7(), DateTime.UtcNow, "A-1", "clerk1", branchA);
        receiptA.AddLine(Guid.CreateVersion7(), 5m, 2m, 0m);

        var receiptB = DirectGoodsReceipt.Create(Guid.CreateVersion7(), DateTime.UtcNow, "B-1", "clerk2", branchB);
        receiptB.AddLine(Guid.CreateVersion7(), 5m, 2m, 0m);

        _db.DirectGoodsReceipts.AddRange(receiptA, receiptB);
        await _db.SaveChangesAsync(CancellationToken.None);

        return (branchA, branchB);
    }

    #region Happy Path

    [Fact]
    public async Task Handle_Should_Return_AllReceipts_When_BranchId_Omitted()
    {
        await SeedTwoBranchesAsync();

        var result = await _sut.Handle(new ListDirectGoodsReceiptsQuery(), CancellationToken.None);

        result.Count.ShouldBe(2);
    }

    [Fact]
    public async Task Handle_Should_FilterByBranch_When_BranchId_Provided()
    {
        var (branchA, _) = await SeedTwoBranchesAsync();

        var result = await _sut.Handle(new ListDirectGoodsReceiptsQuery(branchA), CancellationToken.None);

        result.Count.ShouldBe(1);
        result[0].BranchId.ShouldBe(branchA);
    }

    #endregion

    public void Dispose() => _db.Dispose();
}
