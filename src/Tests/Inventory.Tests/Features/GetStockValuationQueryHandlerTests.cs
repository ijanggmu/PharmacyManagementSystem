using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Features.v1.Reports.GetStockValuation;
using NSubstitute;

namespace Inventory.Tests.Features;

public sealed class GetStockValuationQueryHandlerTests : IDisposable
{
    private readonly InventoryDbContext _db = InventoryDbContextFactory.Create();
    private readonly GetStockValuationQueryHandler _sut;
    private readonly Guid _branchA = Guid.CreateVersion7();
    private readonly Guid _branchB = Guid.CreateVersion7();

    /// <summary>A caller with access to every branch: the requested branch filter is used as given.</summary>
    private static FSH.Modules.Multitenancy.Contracts.ICurrentBranch AllBranches()
    {
        var branch = Substitute.For<FSH.Modules.Multitenancy.Contracts.ICurrentBranch>();
        branch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0));
        branch.CanViewAllBranchesAsync(Arg.Any<CancellationToken>()).Returns(true);
        return branch;
    }

    public GetStockValuationQueryHandlerTests()
    {
        _sut = new GetStockValuationQueryHandler(_db, AllBranches());
    }

    public void Dispose() => _db.Dispose();

    [Fact]
    public async Task Handle_Should_ValueEveryBranch_When_BranchIdOmitted()
    {
        await SeedAsync();

        var result = await _sut.Handle(new GetStockValuationQuery(), CancellationToken.None);

        result.ShouldBe(36m);
    }

    [Fact]
    public async Task Handle_Should_ValueOnlyThatBranchBatches_When_BranchIdProvided()
    {
        await SeedAsync();

        (await _sut.Handle(new GetStockValuationQuery(_branchA), CancellationToken.None)).ShouldBe(20m);
        (await _sut.Handle(new GetStockValuationQuery(_branchB), CancellationToken.None)).ShouldBe(16m);
        (await _sut.Handle(new GetStockValuationQuery(Guid.CreateVersion7()), CancellationToken.None)).ShouldBe(0m);
    }

    private async Task SeedAsync()
    {
        var medicine = Medicine.Create("Paracetamol", null, null, reorderLevel: 0);
        _db.Medicines.Add(medicine);
        var expiry = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1));
        // Branch A: 10 x 2 = 20. Branch B: 4 x 4 = 16.
        _db.MedicineBatches.Add(MedicineBatch.Create(medicine.Id, _branchA, "A1", expiry, 10m, 2m, 3m, null));
        _db.MedicineBatches.Add(MedicineBatch.Create(medicine.Id, _branchB, "B1", expiry, 4m, 4m, 6m, null));
        await _db.SaveChangesAsync(CancellationToken.None);
    }
}
