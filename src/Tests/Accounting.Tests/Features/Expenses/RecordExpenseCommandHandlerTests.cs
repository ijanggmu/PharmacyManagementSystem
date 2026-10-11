using FSH.Framework.Core.Context;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Expenses;
using FSH.Modules.Accounting.Features.v1.Expenses.RecordExpense;
using FSH.Modules.Multitenancy.Contracts;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Accounting.Tests.Features.Expenses;

/// <summary>
/// Covers branch-scoping for <see cref="RecordExpenseCommandHandler"/>: Expense is a
/// nullable-branch ledger entity (docs/branch-scoping-plan.md §2), so the handler calls
/// <see cref="ICurrentBranch.GetBranchIdAsync"/> and persists <c>null</c> when that returns
/// <c>null</c>, rather than requiring a branch.
/// </summary>
public sealed class RecordExpenseCommandHandlerTests : IDisposable
{
    private readonly FSH.Modules.Accounting.Data.AccountingDbContext _db = AccountingDbContextFactory.Create();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly IVoucherPostingService _voucherPostingService = Substitute.For<IVoucherPostingService>();
    private readonly IAccountingAccountResolver _accountResolver = Substitute.For<IAccountingAccountResolver>();

    public RecordExpenseCommandHandlerTests()
    {
        _currentUser.Name.Returns("manager1");
        _accountResolver.ResolveByCodeAsync(Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(Guid.CreateVersion7());
    }

    [Fact]
    public async Task Handle_Should_StampExpenseAndVoucherRequest_With_ResolvedBranchId()
    {
        var branchId = Guid.CreateVersion7();
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(branchId);

        var handler = new RecordExpenseCommandHandler(_db, _voucherPostingService, _accountResolver, _currentUser, _currentBranch);
        var command = new RecordExpenseCommand(DateTime.UtcNow, "Utilities", 75m, "Cash");

        var expenseId = await handler.Handle(command, CancellationToken.None);

        var saved = await _db.Expenses.FirstAsync(e => e.Id == expenseId);
        saved.BranchId.ShouldBe(branchId);

        await _voucherPostingService.Received(1).PostSystemVoucherAsync(
            Arg.Is<PostVoucherRequest>(r => r.BranchId == branchId),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_Should_PersistNullBranchId_When_NoBranchResolved()
    {
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns((Guid?)null);

        var handler = new RecordExpenseCommandHandler(_db, _voucherPostingService, _accountResolver, _currentUser, _currentBranch);
        var command = new RecordExpenseCommand(DateTime.UtcNow, "Utilities", 75m, "Cash");

        var expenseId = await handler.Handle(command, CancellationToken.None);

        var saved = await _db.Expenses.FirstAsync(e => e.Id == expenseId);
        saved.BranchId.ShouldBeNull();

        await _voucherPostingService.Received(1).PostSystemVoucherAsync(
            Arg.Is<PostVoucherRequest>(r => r.BranchId == null),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_Should_PersistReceiptReference_And_PutItInVoucherNarration()
    {
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns((Guid?)null);
        var handler = new RecordExpenseCommandHandler(_db, _voucherPostingService, _accountResolver, _currentUser, _currentBranch);
        var command = new RecordExpenseCommand(DateTime.UtcNow, "Utilities", 75m, "Bank", "Electricity", "  NEA-2083-17  ");

        var expenseId = await handler.Handle(command, CancellationToken.None);

        (await _db.Expenses.FirstAsync(e => e.Id == expenseId)).ReceiptReference.ShouldBe("NEA-2083-17");
        await _voucherPostingService.Received(1).PostSystemVoucherAsync(
            Arg.Is<PostVoucherRequest>(r => r.Narration == "Expense: Utilities — Electricity (receipt NEA-2083-17)"),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public void Validator_Should_Reject_ReceiptReferenceOver128Chars()
    {
        var validator = new RecordExpenseCommandValidator();

        validator.Validate(new RecordExpenseCommand(DateTime.UtcNow, "Utilities", 1m, "Cash", null, new string('x', 129))).IsValid.ShouldBeFalse();
        validator.Validate(new RecordExpenseCommand(DateTime.UtcNow, "Utilities", 1m, "Cash", null, "R-1")).IsValid.ShouldBeTrue();
    }

    [Theory]
    [InlineData("Cash", "1000")]
    [InlineData("cash", "1000")]
    [InlineData("bank", "1010")]
    [InlineData("card", "1010")]
    [InlineData("other", "1010")]
    public async Task Handle_Should_CreditMoneyAccount_ForPaymentMethod(string method, string expectedCode)
    {
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns((Guid?)null);
        var handler = new RecordExpenseCommandHandler(_db, _voucherPostingService, _accountResolver, _currentUser, _currentBranch);

        await handler.Handle(new RecordExpenseCommand(DateTime.UtcNow, "Rent", 10m, method), CancellationToken.None);

        await _accountResolver.Received(1).ResolveByCodeAsync(expectedCode, Arg.Any<CancellationToken>());
        await _accountResolver.DidNotReceive().ResolveByCodeAsync(expectedCode == "1000" ? "1010" : "1000", Arg.Any<CancellationToken>());
    }

    public void Dispose() => _db.Dispose();
}
