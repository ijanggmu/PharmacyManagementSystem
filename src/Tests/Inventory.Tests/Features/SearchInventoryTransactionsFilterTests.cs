using FSH.Modules.Inventory.Contracts.v1.Transactions;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Features.v1.Transactions.SearchInventoryTransactions;
using FSH.Modules.Multitenancy.Contracts;
using NSubstitute;

namespace Inventory.Tests.Features;

/// <summary>Movement-history type filter: the page's legacy values ("expired", "return",
/// "supplier_return") must map to the stored enum instead of being rejected or ignored.</summary>
public sealed class SearchInventoryTransactionsFilterTests : IDisposable
{
    private readonly InventoryDbContext _db = InventoryDbContextFactory.Create();
    private readonly ICurrentBranch _currentBranch = NoCurrentBranch();

    private static ICurrentBranch NoCurrentBranch()
    {
        var branch = Substitute.For<ICurrentBranch>();
        branch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0));
        return branch;
    }

    [Theory]
    [InlineData("expired", InventoryTransactionType.Dispose)]
    [InlineData("EXPIRED", InventoryTransactionType.Dispose)]
    [InlineData("Dispose", InventoryTransactionType.Dispose)]
    [InlineData("return", InventoryTransactionType.SaleReversal)]
    [InlineData("supplier_return", InventoryTransactionType.SupplierReturn)]
    [InlineData("recall", InventoryTransactionType.Recall)]
    [InlineData("purchase", InventoryTransactionType.Purchase)]
    [InlineData(" Sale ", InventoryTransactionType.Sale)]
    public void TryParse_Should_Accept_Enum_Names_And_Legacy_Aliases(string value, InventoryTransactionType expected)
    {
        InventoryTransactionTypeFilter.TryParse(value, out var type).ShouldBeTrue();
        type.ShouldBe(expected);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("bogus")]
    [InlineData("4")]
    [InlineData("99")]
    [InlineData("-1")]
    public void TryParse_Should_Reject_Unknown_Or_Numeric_Values(string? value)
    {
        InventoryTransactionTypeFilter.TryParse(value, out _).ShouldBeFalse();
    }

    [Fact]
    public void Validator_Should_Reject_Unknown_TransactionType()
    {
        var validator = new SearchInventoryTransactionsQueryValidator();

        validator.Validate(new SearchInventoryTransactionsQuery(TransactionType: "bogus")).IsValid.ShouldBeFalse();
        validator.Validate(new SearchInventoryTransactionsQuery(TransactionType: "expired")).IsValid.ShouldBeTrue();
        validator.Validate(new SearchInventoryTransactionsQuery()).IsValid.ShouldBeTrue();
    }

    [Fact]
    public async Task Handle_Should_Filter_Expired_To_Dispose_Movements()
    {
        var branchId = Guid.CreateVersion7();
        var medicineId = Guid.CreateVersion7();
        _db.InventoryTransactions.Add(InventoryTransaction.Create(medicineId, branchId, null, InventoryTransactionType.Dispose, -4m, 1m));
        _db.InventoryTransactions.Add(InventoryTransaction.Create(medicineId, branchId, null, InventoryTransactionType.Sale, -1m, 1m));
        _db.InventoryTransactions.Add(InventoryTransaction.Create(medicineId, branchId, null, InventoryTransactionType.Purchase, 10m, 1m));
        await _db.SaveChangesAsync(CancellationToken.None);

        var handler = new SearchInventoryTransactionsQueryHandler(_db, _currentBranch, Substitute.For<Mediator.IMediator>(), Substitute.For<FSH.Modules.Identity.Contracts.Services.IUserService>());
        var result = await handler.Handle(new SearchInventoryTransactionsQuery(TransactionType: "expired"), CancellationToken.None);

        var row = result.Items.ShouldHaveSingleItem();
        row.TransactionType.ShouldBe("Dispose");
        row.QuantityDelta.ShouldBe(-4m);
        result.TotalCount.ShouldBe(1);
    }

    [Fact]
    public async Task Handle_Should_Apply_Utc_Date_Range()
    {
        var branchId = Guid.CreateVersion7();
        var medicineId = Guid.CreateVersion7();
        _db.InventoryTransactions.Add(InventoryTransaction.Create(medicineId, branchId, null, InventoryTransactionType.Adjustment, 1m, 1m));
        await _db.SaveChangesAsync(CancellationToken.None);

        var handler = new SearchInventoryTransactionsQueryHandler(_db, _currentBranch, Substitute.For<Mediator.IMediator>(), Substitute.For<FSH.Modules.Identity.Contracts.Services.IUserService>());
        var future = DateTime.SpecifyKind(DateTime.UtcNow.AddDays(1), DateTimeKind.Unspecified);

        var inRange = await handler.Handle(
            new SearchInventoryTransactionsQuery(DateFrom: DateTime.UtcNow.AddDays(-1), DateTo: future), CancellationToken.None);
        var outOfRange = await handler.Handle(
            new SearchInventoryTransactionsQuery(DateFrom: future), CancellationToken.None);

        inRange.Items.Count.ShouldBe(1);
        outOfRange.Items.ShouldBeEmpty();
    }

    public void Dispose() => _db.Dispose();
}
