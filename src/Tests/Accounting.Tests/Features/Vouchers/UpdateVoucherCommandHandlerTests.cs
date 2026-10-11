using FSH.Modules.Accounting.Contracts.v1.Vouchers;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.Vouchers.UpdateVoucher;
using Microsoft.EntityFrameworkCore;

namespace Accounting.Tests.Features.Vouchers;

/// <summary>
/// Covers <see cref="UpdateVoucherCommandHandler"/>: editing a DRAFT voucher's date, narration and
/// lines, and refusing to edit a Posted one — a posted voucher is immutable (rule.md §9.1); only
/// reverse/void touch it.
/// </summary>
public sealed class UpdateVoucherCommandHandlerTests : IDisposable
{
    private readonly FSH.Modules.Accounting.Data.AccountingDbContext _db = AccountingDbContextFactory.Create();

    private async Task<Guid> SeedDraftAsync()
    {
        var voucher = AccountingVoucher.CreateDraft(DateTime.UtcNow, "journal", AccountingVoucherSource.Manual, "original");
        voucher.AddLine(Guid.CreateVersion7(), "debit", 100m, 0m);
        voucher.AddLine(Guid.CreateVersion7(), "credit", 0m, 100m);
        _db.Vouchers.Add(voucher);
        await _db.SaveChangesAsync();
        return voucher.Id;
    }

    [Fact]
    public async Task Handle_Should_ReplaceDateNarrationAndLines_When_StillDraft()
    {
        var voucherId = await SeedDraftAsync();
        var newDate = DateTime.UtcNow.AddDays(-2);
        var accountA = (await AccountingTestChart.AddAsync(_db, "1300", AccountingAccountType.Asset)).Id;
        var accountB = (await AccountingTestChart.AddAsync(_db, "4300", AccountingAccountType.Revenue)).Id;

        var handler = new UpdateVoucherCommandHandler(_db, NSubstitute.Substitute.For<FSH.Modules.Multitenancy.Contracts.ICurrentBranch>());
        var command = new UpdateVoucherCommand(
            voucherId, newDate, "updated narration",
            [
                new VoucherLineInput(accountA, "new debit", 250m, 0m),
                new VoucherLineInput(accountB, "new credit", 0m, 250m),
            ]);

        await handler.Handle(command, CancellationToken.None);

        var saved = await _db.Vouchers.Include(v => v.Lines).FirstAsync(v => v.Id == voucherId);
        saved.Narration.ShouldBe("updated narration");
        saved.Lines.Count.ShouldBe(2);
        saved.Lines.ShouldContain(l => l.AccountId == accountA && l.DebitAmount == 250m);
        saved.Lines.ShouldContain(l => l.AccountId == accountB && l.CreditAmount == 250m);
    }

    [Fact]
    public async Task Handle_Should_Reject_GroupAccountLine()
    {
        var voucherId = await SeedDraftAsync();
        var group = await AccountingTestChart.AddAsync(_db, "1300", AccountingAccountType.Asset);
        await AccountingTestChart.AddAsync(_db, "130001", AccountingAccountType.Asset, group);
        var leaf = await AccountingTestChart.AddAsync(_db, "4300", AccountingAccountType.Revenue);

        var command = new UpdateVoucherCommand(
            voucherId, DateTime.UtcNow, "x",
            [new VoucherLineInput(group.Id, "debit", 10m, 0m), new VoucherLineInput(leaf.Id, "credit", 0m, 10m)]);

        var ex = await Should.ThrowAsync<FSH.Framework.Core.Exceptions.CustomException>(
            () => new UpdateVoucherCommandHandler(_db, NSubstitute.Substitute.For<FSH.Modules.Multitenancy.Contracts.ICurrentBranch>()).Handle(command, CancellationToken.None).AsTask());
        ex.Message.ShouldContain("group account");
    }

    [Fact]
    public async Task Handle_Should_Throw_When_VoucherAlreadyPosted()
    {
        var voucher = AccountingVoucher.CreateDraft(DateTime.UtcNow, "journal", AccountingVoucherSource.Manual, "original");
        voucher.AddLine(Guid.CreateVersion7(), "debit", 100m, 0m);
        voucher.AddLine(Guid.CreateVersion7(), "credit", 0m, 100m);
        voucher.Post("JV-0001", "tester");
        _db.Vouchers.Add(voucher);
        await _db.SaveChangesAsync();

        var handler = new UpdateVoucherCommandHandler(_db, NSubstitute.Substitute.For<FSH.Modules.Multitenancy.Contracts.ICurrentBranch>());
        var command = new UpdateVoucherCommand(
            voucher.Id, DateTime.UtcNow, "nope",
            [new VoucherLineInput(Guid.CreateVersion7(), "x", 10m, 0m), new VoucherLineInput(Guid.CreateVersion7(), "y", 0m, 10m)]);

        await Should.ThrowAsync<FSH.Framework.Core.Exceptions.CustomException>(
            () => handler.Handle(command, CancellationToken.None).AsTask());
    }

    [Fact]
    public async Task Handle_Should_Throw_When_VoucherNotFound()
    {
        var handler = new UpdateVoucherCommandHandler(_db, NSubstitute.Substitute.For<FSH.Modules.Multitenancy.Contracts.ICurrentBranch>());
        var command = new UpdateVoucherCommand(
            Guid.CreateVersion7(), DateTime.UtcNow, null,
            [new VoucherLineInput(Guid.CreateVersion7(), "x", 10m, 0m), new VoucherLineInput(Guid.CreateVersion7(), "y", 0m, 10m)]);

        await Should.ThrowAsync<FSH.Framework.Core.Exceptions.NotFoundException>(
            () => handler.Handle(command, CancellationToken.None).AsTask());
    }

    public void Dispose() => _db.Dispose();
}
