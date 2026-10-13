using FSH.Modules.Accounting.Services;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Banking;
using FSH.Modules.Accounting.Features.v1.Banking.RecordBankDeposit;
using FSH.Modules.Multitenancy.Contracts;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Accounting.Tests.Features.Banking;

/// <summary>
/// Covers branch-scoping for <see cref="RecordBankDepositCommandHandler"/>: BankDeposit is a
/// required-branch entity (docs/branch-scoping-plan.md §2), so the handler must call
/// <see cref="ICurrentBranch.RequireBranchIdAsync"/> and stamp both the deposit and the posted
/// system voucher with the resolved branch.
/// </summary>
public sealed class RecordBankDepositCommandHandlerTests : IDisposable
{
    private readonly FSH.Modules.Accounting.Data.AccountingDbContext _db = AccountingDbContextFactory.Create();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly IVoucherPostingService _voucherPostingService = Substitute.For<IVoucherPostingService>();
    private readonly IAccountingAccountResolver _accountResolver = Substitute.For<IAccountingAccountResolver>();

    public RecordBankDepositCommandHandlerTests()
    {
        _currentUser.Name.Returns("cashier1");
        _accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Bank, Arg.Any<CancellationToken>())
            .Returns(Guid.CreateVersion7());
        _accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Cash, Arg.Any<CancellationToken>())
            .Returns(Guid.CreateVersion7());
    }

    [Fact]
    public async Task Handle_Should_StampDepositAndVoucherRequest_With_RequiredBranchId()
    {
        var branchId = Guid.CreateVersion7();
        _currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(branchId);

        var handler = new RecordBankDepositCommandHandler(_db, _voucherPostingService, TestPaymentAccounts.For(_accountResolver, _db), _currentUser, _currentBranch, new AccountingPostingLockService(_db));
        var command = new RecordBankDepositCommand(DateTime.UtcNow, 250m, "till takings");

        var depositId = await handler.Handle(command, CancellationToken.None);

        var saved = await _db.BankDeposits.FirstAsync(d => d.Id == depositId);
        saved.BranchId.ShouldBe(branchId);

        await _voucherPostingService.Received(1).PostSystemVoucherAsync(
            Arg.Is<PostVoucherRequest>(r => r.BranchId == branchId),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_Should_Propagate_When_NoBranchResolved()
    {
        // A tenant with zero branches (shouldn't happen past onboarding) — RequireBranchIdAsync
        // throws rather than silently falling back to an arbitrary branch.
        _currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>())
            .Returns(Task.FromException<Guid>(new NotFoundException("No branch configured for this tenant.")));

        var handler = new RecordBankDepositCommandHandler(_db, _voucherPostingService, TestPaymentAccounts.For(_accountResolver, _db), _currentUser, _currentBranch, new AccountingPostingLockService(_db));
        var command = new RecordBankDepositCommand(DateTime.UtcNow, 250m, "till takings");

        await Should.ThrowAsync<NotFoundException>(() => handler.Handle(command, CancellationToken.None).AsTask());
        (await _db.BankDeposits.CountAsync()).ShouldBe(0);
    }

    public void Dispose() => _db.Dispose();
}
