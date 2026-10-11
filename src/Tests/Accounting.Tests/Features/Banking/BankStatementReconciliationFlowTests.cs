using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.v1.Banking;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.Banking.AutoMatchBankStatementImport;
using FSH.Modules.Accounting.Features.v1.Banking.CompleteBankStatementImport;
using FSH.Modules.Accounting.Features.v1.Banking.CreateBankStatementImport;
using FSH.Modules.Accounting.Features.v1.Banking.MatchBankStatementLine;
using FSH.Modules.Multitenancy.Contracts;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Accounting.Tests.Features.Banking;

/// <summary>
/// Covers the bank statement import/reconciliation vertical slice end to end: import, auto-match
/// against posted GL lines, complete — plus the two guard rails ported from
/// bank-reconciliation-service.ts (complete rejects unless every line is accounted for; matching an
/// already-matched line is rejected).
/// </summary>
public sealed class BankStatementReconciliationFlowTests : IDisposable
{
    private readonly FSH.Modules.Accounting.Data.AccountingDbContext _db = AccountingDbContextFactory.Create();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly Guid _branchId = Guid.CreateVersion7();

    private readonly CreateBankStatementImportCommandHandler _createHandler;
    private readonly AutoMatchBankStatementImportCommandHandler _autoMatchHandler;
    private readonly CompleteBankStatementImportCommandHandler _completeHandler;
    private readonly MatchBankStatementLineCommandHandler _matchHandler;

    public BankStatementReconciliationFlowTests()
    {
        _currentUser.Name.Returns("tester");
        _currentUser.GetUserId().Returns(Guid.CreateVersion7());
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns((Guid?)_branchId);

        _createHandler = new CreateBankStatementImportCommandHandler(_db, _currentUser, _currentBranch);
        _autoMatchHandler = new AutoMatchBankStatementImportCommandHandler(_db, _currentUser);
        _completeHandler = new CompleteBankStatementImportCommandHandler(_db, _currentUser);
        _matchHandler = new MatchBankStatementLineCommandHandler(_db, _currentUser);
    }

    private async Task<AccountingAccount> SeedBankAccountAsync()
    {
        var account = AccountingAccount.Create("1010", "Bank", AccountingAccountType.Asset);
        _db.Accounts.Add(account);
        await _db.SaveChangesAsync(CancellationToken.None);
        return account;
    }

    private async Task<AccountingVoucherLine> SeedPostedGlLineAsync(Guid bankAccountId, DateTime voucherDateUtc, decimal debit, decimal credit)
    {
        string unique = Guid.CreateVersion7().ToString("N")[..8];
        var contra = AccountingAccount.Create($"9{unique}", "Misc", AccountingAccountType.Expense);
        _db.Accounts.Add(contra);

        // Posted at the same branch the statement is imported for (a branch reconciles its own postings).
        var voucher = AccountingVoucher.CreateDraft(voucherDateUtc, "journal", AccountingVoucherSource.Manual, "Seed", branchId: _branchId);
        voucher.AddLine(bankAccountId, "Bank leg", debit, credit);
        voucher.AddLine(contra.Id, "Contra leg", credit, debit);
        voucher.Post($"MV-{unique}", "seed");

        _db.Vouchers.Add(voucher);
        await _db.SaveChangesAsync(CancellationToken.None);

        return voucher.Lines.First(l => l.AccountId == bankAccountId);
    }

    #region Happy Path

    [Fact]
    public async Task Handle_Should_Import_AutoMatch_And_Complete_When_LinesReconcile()
    {
        // Arrange
        var bank = await SeedBankAccountAsync();
        var periodStart = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var periodEnd = new DateTime(2026, 1, 31, 0, 0, 0, DateTimeKind.Utc);
        await SeedPostedGlLineAsync(bank.Id, periodStart.AddDays(4), debit: 100m, credit: 0m);

        var createCommand = new CreateBankStatementImportCommand(
            bank.Id, "January", periodStart, periodEnd, null, null,
            [new BankStatementImportLineInput(periodStart.AddDays(4), "Deposit", "REF1", 100m, 0m)]);

        // Act
        var importId = await _createHandler.Handle(createCommand, CancellationToken.None);
        var autoMatchResult = await _autoMatchHandler.Handle(new AutoMatchBankStatementImportCommand(importId), CancellationToken.None);
        var completedId = await _completeHandler.Handle(new CompleteBankStatementImportCommand(importId), CancellationToken.None);

        // Assert
        autoMatchResult.MatchedCount.ShouldBe(1);
        completedId.ShouldBe(importId);
        var saved = await _db.BankStatementImports.Include(i => i.Lines).FirstAsync(i => i.Id == importId);
        saved.Status.ShouldBe(BankStatementImportStatus.Reconciled);
        saved.Lines.Single().Status.ShouldBe(BankStatementLineStatus.Matched);
    }

    #endregion

    #region Guards

    [Fact]
    public async Task CompleteHandle_Should_Throw_When_StatementLineUnmatched()
    {
        // Arrange — imported line has no corresponding GL entry, so auto-match leaves it unmatched.
        var bank = await SeedBankAccountAsync();
        var periodStart = new DateTime(2026, 2, 1, 0, 0, 0, DateTimeKind.Utc);
        var periodEnd = new DateTime(2026, 2, 28, 0, 0, 0, DateTimeKind.Utc);

        var createCommand = new CreateBankStatementImportCommand(
            bank.Id, "February", periodStart, periodEnd, null, null,
            [new BankStatementImportLineInput(periodStart.AddDays(2), "Unexplained credit", "REF2", 50m, 0m)]);
        var importId = await _createHandler.Handle(createCommand, CancellationToken.None);

        // Act & Assert
        var ex = await Should.ThrowAsync<CustomException>(
            () => _completeHandler.Handle(new CompleteBankStatementImportCommand(importId), CancellationToken.None).AsTask());
        ex.Message.ShouldContain("unmatched");

        var saved = await _db.BankStatementImports.FirstAsync(i => i.Id == importId);
        saved.Status.ShouldBe(BankStatementImportStatus.Open);
    }

    [Fact]
    public async Task MatchHandle_Should_Throw_When_LineAlreadyMatched()
    {
        // Arrange
        var bank = await SeedBankAccountAsync();
        var periodStart = new DateTime(2026, 3, 1, 0, 0, 0, DateTimeKind.Utc);
        var periodEnd = new DateTime(2026, 3, 31, 0, 0, 0, DateTimeKind.Utc);
        var glLine = await SeedPostedGlLineAsync(bank.Id, periodStart.AddDays(5), debit: 75m, credit: 0m);

        var createCommand = new CreateBankStatementImportCommand(
            bank.Id, "March", periodStart, periodEnd, null, null,
            [new BankStatementImportLineInput(periodStart.AddDays(5), "Deposit", "REF3", 75m, 0m)]);
        var importId = await _createHandler.Handle(createCommand, CancellationToken.None);
        var saved = await _db.BankStatementImports.Include(i => i.Lines).FirstAsync(i => i.Id == importId);
        var lineId = saved.Lines.Single().Id;

        await _matchHandler.Handle(new MatchBankStatementLineCommand(lineId, glLine.Id), CancellationToken.None);

        // Act & Assert — matching the same (now-matched) line again is rejected.
        var ex = await Should.ThrowAsync<CustomException>(
            () => _matchHandler.Handle(new MatchBankStatementLineCommand(lineId, glLine.Id), CancellationToken.None).AsTask());
        ex.Message.ShouldContain("already matched");
    }

    #endregion

    public void Dispose() => _db.Dispose();
}
