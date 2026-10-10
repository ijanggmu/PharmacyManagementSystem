using FSH.Modules.Accounting.Contracts.v1.Vouchers;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.Vouchers.CreateManualVoucher;
using FSH.Modules.Multitenancy.Contracts;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Accounting.Tests.Features.Vouchers;

/// <summary>
/// Covers branch-scoping for <see cref="CreateManualVoucherCommandHandler"/>: AccountingVoucher
/// keeps BranchId nullable (docs/branch-scoping-plan.md §2), sourced via
/// <see cref="ICurrentBranch.GetBranchIdAsync"/>.
/// </summary>
public sealed class CreateManualVoucherCommandHandlerTests : IDisposable
{
    private readonly FSH.Modules.Accounting.Data.AccountingDbContext _db = AccountingDbContextFactory.Create();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();

    [Fact]
    public async Task Handle_Should_StampVoucherAndLines_With_ResolvedBranchId()
    {
        var branchId = Guid.CreateVersion7();
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(branchId);

        var handler = new CreateManualVoucherCommandHandler(_db, _currentBranch);
        var command = await JournalAsync();

        var voucherId = await handler.Handle(command, CancellationToken.None);

        var saved = await _db.Vouchers.Include(v => v.Lines).FirstAsync(v => v.Id == voucherId);
        saved.BranchId.ShouldBe(branchId);
        saved.Lines.ShouldAllBe(l => l.BranchId == branchId);
    }

    [Fact]
    public async Task Handle_Should_LeaveBranchIdNull_When_NoBranchResolved()
    {
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns((Guid?)null);

        var handler = new CreateManualVoucherCommandHandler(_db, _currentBranch);
        var command = await JournalAsync();

        var voucherId = await handler.Handle(command, CancellationToken.None);

        var saved = await _db.Vouchers.Include(v => v.Lines).FirstAsync(v => v.Id == voucherId);
        saved.BranchId.ShouldBeNull();
        saved.Lines.ShouldAllBe(l => l.BranchId == null);
    }

    [Fact]
    public async Task Handle_Should_Reject_GroupAndInactiveAccounts()
    {
        var group = await AccountingTestChart.AddAsync(_db, "1300", AccountingAccountType.Asset);
        await AccountingTestChart.AddAsync(_db, "130001", AccountingAccountType.Asset, group);
        var inactive = await AccountingTestChart.AddAsync(_db, "5300", AccountingAccountType.Expense);
        inactive.Deactivate();
        await _db.SaveChangesAsync();

        var command = new CreateManualVoucherCommand(
            DateTime.UtcNow, "bad journal",
            [new VoucherLineInput(group.Id, "debit", 50m, 0m), new VoucherLineInput(inactive.Id, "credit", 0m, 50m)]);

        var ex = await Should.ThrowAsync<FSH.Framework.Core.Exceptions.CustomException>(
            () => new CreateManualVoucherCommandHandler(_db, _currentBranch).Handle(command, CancellationToken.None).AsTask());

        ex.Message.ShouldContain("1300");
        ex.Message.ShouldContain("5300");
        (await _db.Vouchers.CountAsync()).ShouldBe(0);
    }

    [Fact]
    public async Task Handle_Should_Reject_RootHead()
    {
        var root = await AccountingTestChart.RootAsync(_db, AccountingAccountType.Asset);
        var leaf = await AccountingTestChart.AddAsync(_db, "4300", AccountingAccountType.Revenue);

        var command = new CreateManualVoucherCommand(
            DateTime.UtcNow, "bad journal",
            [new VoucherLineInput(root.Id, "debit", 50m, 0m), new VoucherLineInput(leaf.Id, "credit", 0m, 50m)]);

        await Should.ThrowAsync<FSH.Framework.Core.Exceptions.CustomException>(
            () => new CreateManualVoucherCommandHandler(_db, _currentBranch).Handle(command, CancellationToken.None).AsTask());
    }

    private async Task<CreateManualVoucherCommand> JournalAsync()
    {
        var debit = await AccountingTestChart.AddAsync(_db, "1300", AccountingAccountType.Asset);
        var credit = await AccountingTestChart.AddAsync(_db, "4300", AccountingAccountType.Revenue);
        return new CreateManualVoucherCommand(
            DateTime.UtcNow, "test journal",
            [
                new VoucherLineInput(debit.Id, "debit", 50m, 0m),
                new VoucherLineInput(credit.Id, "credit", 0m, 50m),
            ]);
    }

    public void Dispose() => _db.Dispose();
}
