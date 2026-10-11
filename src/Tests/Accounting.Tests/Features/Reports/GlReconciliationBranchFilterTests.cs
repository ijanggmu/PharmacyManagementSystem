using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.Reports.GetApGlReconciliation;
using FSH.Modules.Accounting.Features.v1.Reports.GetArGlReconciliation;
using FSH.Modules.Accounting.Features.v1.Reports.GetInventoryGlReconciliation;
using FSH.Modules.Customers.Contracts.v1.Ledger;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using Mediator;
using NSubstitute;

namespace Accounting.Tests.Features.Reports;

/// <summary>
/// AR / AP / Inventory GL reconciliations: both the GL side (posted vouchers) and the sub-ledger side
/// (the other module's total, requested with the resolved branch) follow the same branch filter.
/// </summary>
public sealed class GlReconciliationBranchFilterTests : IDisposable
{
    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly Guid _branchA = Guid.CreateVersion7();
    private readonly Guid _branchB = Guid.CreateVersion7();

    public GlReconciliationBranchFilterTests()
    {
        // Caller holding Branches.ViewAll: the requested branch passes through, null = all branches.
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>())
            .Returns(ci => ci.ArgAt<Guid?>(0));

#pragma warning disable CA2012 // NSubstitute stores the ValueTask as a configured return value, not as a consumed one.
        _mediator.Send(Arg.Any<GetTotalArBalanceQuery>(), Arg.Any<CancellationToken>())
            .Returns(ci => new ValueTask<decimal>(ci.ArgAt<GetTotalArBalanceQuery>(0).BranchId == _branchA ? 100m : 300m));
        _mediator.Send(Arg.Any<GetTotalApBalanceQuery>(), Arg.Any<CancellationToken>())
            .Returns(ci => new ValueTask<decimal>(ci.ArgAt<GetTotalApBalanceQuery>(0).BranchId == _branchA ? 40m : 90m));
        _mediator.Send(Arg.Any<GetStockValuationQuery>(), Arg.Any<CancellationToken>())
            .Returns(ci => new ValueTask<decimal>(ci.ArgAt<GetStockValuationQuery>(0).BranchId == _branchA ? 500m : 800m));
#pragma warning restore CA2012
    }

    public void Dispose() => _db.Dispose();

    [Fact]
    public async Task ArReconciliation_Should_FilterGlAndSubledger_By_Branch()
    {
        var ar = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.AccountsReceivable, AccountingAccountType.Asset, isSystem: true);
        await SeedPostedAsync(ar.Id, debit: 100m, credit: 0m, _branchA);
        await SeedPostedAsync(ar.Id, debit: 250m, credit: 0m, _branchB);
        var sut = new GetArGlReconciliationQueryHandler(_db, _mediator, _currentBranch);

        var result = await sut.Handle(new GetArGlReconciliationQuery(_branchA), CancellationToken.None);

        result.BranchId.ShouldBe(_branchA);
        result.SubledgerTotal.ShouldBe(100m);
        result.GlBalance.ShouldBe(100m);
        result.Variance.ShouldBe(0m);
        await _mediator.Received(1).Send(
            Arg.Is<GetTotalArBalanceQuery>(q => q.BranchId == _branchA), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task ArReconciliation_Should_IncludeEveryBranch_When_BranchIdOmitted()
    {
        var ar = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.AccountsReceivable, AccountingAccountType.Asset, isSystem: true);
        await SeedPostedAsync(ar.Id, debit: 100m, credit: 0m, _branchA);
        await SeedPostedAsync(ar.Id, debit: 250m, credit: 0m, _branchB);
        await SeedPostedAsync(ar.Id, debit: 0m, credit: 50m, branchId: null);
        var sut = new GetArGlReconciliationQueryHandler(_db, _mediator, _currentBranch);

        var result = await sut.Handle(new GetArGlReconciliationQuery(), CancellationToken.None);

        result.BranchId.ShouldBeNull();
        result.SubledgerTotal.ShouldBe(300m);
        result.GlBalance.ShouldBe(300m);
        result.Variance.ShouldBe(0m);
        await _mediator.Received(1).Send(
            Arg.Is<GetTotalArBalanceQuery>(q => q.BranchId == null), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task ApReconciliation_Should_FilterGlAndSubledger_By_Branch()
    {
        var ap = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.AccountsPayable, AccountingAccountType.Liability, isSystem: true);
        await SeedPostedAsync(ap.Id, debit: 0m, credit: 40m, _branchA);
        await SeedPostedAsync(ap.Id, debit: 0m, credit: 70m, _branchB);
        var sut = new GetApGlReconciliationQueryHandler(_db, _mediator, _currentBranch);

        var result = await sut.Handle(new GetApGlReconciliationQuery(_branchA), CancellationToken.None);

        result.BranchId.ShouldBe(_branchA);
        result.SubledgerTotal.ShouldBe(40m);
        result.GlBalance.ShouldBe(40m);
        result.Variance.ShouldBe(0m);
        await _mediator.Received(1).Send(
            Arg.Is<GetTotalApBalanceQuery>(q => q.BranchId == _branchA), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task InventoryReconciliation_Should_FilterGlAndSubledger_By_Branch()
    {
        var inventory = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.Inventory, AccountingAccountType.Asset, isSystem: true);
        await SeedPostedAsync(inventory.Id, debit: 520m, credit: 0m, _branchA);
        await SeedPostedAsync(inventory.Id, debit: 300m, credit: 0m, _branchB);
        var sut = new GetInventoryGlReconciliationQueryHandler(_db, _mediator, _currentBranch);

        var result = await sut.Handle(new GetInventoryGlReconciliationQuery(_branchA), CancellationToken.None);

        result.BranchId.ShouldBe(_branchA);
        result.SubledgerTotal.ShouldBe(500m);
        result.GlBalance.ShouldBe(520m);
        result.Variance.ShouldBe(-20m);
        await _mediator.Received(1).Send(
            Arg.Is<GetStockValuationQuery>(q => q.BranchId == _branchA), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Reconciliation_Should_UseResolvedBranch_For_CallerPinnedToOwnBranch()
    {
        // A caller without Branches.ViewAll is confined to their own branch even when asking for "all".
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>())
            .Returns(ci => ci.ArgAt<Guid?>(0) ?? _branchA);
        var ar = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.AccountsReceivable, AccountingAccountType.Asset, isSystem: true);
        await SeedPostedAsync(ar.Id, debit: 100m, credit: 0m, _branchA);
        await SeedPostedAsync(ar.Id, debit: 250m, credit: 0m, _branchB);
        var sut = new GetArGlReconciliationQueryHandler(_db, _mediator, _currentBranch);

        var result = await sut.Handle(new GetArGlReconciliationQuery(), CancellationToken.None);

        result.BranchId.ShouldBe(_branchA);
        result.GlBalance.ShouldBe(100m);
        result.SubledgerTotal.ShouldBe(100m);
    }

    [Fact]
    public async Task Reconciliation_Should_IgnoreUnpostedVouchers_In_Branch()
    {
        var ar = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.AccountsReceivable, AccountingAccountType.Asset, isSystem: true);
        await SeedPostedAsync(ar.Id, debit: 100m, credit: 0m, _branchA);
        var contra = await AccountingTestChart.AddAsync(_db, "4999", AccountingAccountType.Revenue);
        var draft = AccountingVoucher.CreateDraft(DateTime.UtcNow, "journal", AccountingVoucherSource.Manual, "Draft", branchId: _branchA);
        draft.AddLine(ar.Id, "AR", 999m, 0m);
        draft.AddLine(contra.Id, "Contra", 0m, 999m);
        _db.Vouchers.Add(draft);
        await _db.SaveChangesAsync(CancellationToken.None);
        var sut = new GetArGlReconciliationQueryHandler(_db, _mediator, _currentBranch);

        var result = await sut.Handle(new GetArGlReconciliationQuery(_branchA), CancellationToken.None);

        result.GlBalance.ShouldBe(100m);
    }

    private async Task SeedPostedAsync(Guid accountId, decimal debit, decimal credit, Guid? branchId)
    {
        string unique = Guid.CreateVersion7().ToString("N")[..8];
        var contra = AccountingAccount.Create($"9{unique}", "Contra", AccountingAccountType.Expense);
        _db.Accounts.Add(contra);

        var voucher = AccountingVoucher.CreateDraft(DateTime.UtcNow, "journal", AccountingVoucherSource.Manual, "Seed", branchId: branchId);
        voucher.AddLine(accountId, "Control leg", debit, credit);
        voucher.AddLine(contra.Id, "Contra leg", credit, debit);
        voucher.Post($"MV-{unique}", "seed");

        _db.Vouchers.Add(voucher);
        await _db.SaveChangesAsync(CancellationToken.None);
    }
}
