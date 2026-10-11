using FSH.Modules.Accounting.Contracts.v1.Vouchers;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.Vouchers.DeleteVoucher;
using Microsoft.EntityFrameworkCore;

namespace Accounting.Tests.Features.Vouchers;

/// <summary>
/// Covers <see cref="DeleteVoucherCommandHandler"/>: deleting a DRAFT voucher outright, and refusing
/// to delete a Posted one — a posted voucher is immutable (rule.md §9.1) and must be reversed, never
/// deleted.
/// </summary>
public sealed class DeleteVoucherCommandHandlerTests : IDisposable
{
    private readonly FSH.Modules.Accounting.Data.AccountingDbContext _db = AccountingDbContextFactory.Create();

    [Fact]
    public async Task Handle_Should_RemoveVoucherAndLines_When_StillDraft()
    {
        var voucher = AccountingVoucher.CreateDraft(DateTime.UtcNow, "journal", AccountingVoucherSource.Manual, "draft");
        voucher.AddLine(Guid.CreateVersion7(), "debit", 100m, 0m);
        voucher.AddLine(Guid.CreateVersion7(), "credit", 0m, 100m);
        _db.Vouchers.Add(voucher);
        await _db.SaveChangesAsync();

        var handler = new DeleteVoucherCommandHandler(_db);
        await handler.Handle(new DeleteVoucherCommand(voucher.Id), CancellationToken.None);

        (await _db.Vouchers.AnyAsync(v => v.Id == voucher.Id)).ShouldBeFalse();
    }

    [Fact]
    public async Task Handle_Should_Throw_When_VoucherAlreadyPosted()
    {
        var voucher = AccountingVoucher.CreateDraft(DateTime.UtcNow, "journal", AccountingVoucherSource.Manual, "draft");
        voucher.AddLine(Guid.CreateVersion7(), "debit", 100m, 0m);
        voucher.AddLine(Guid.CreateVersion7(), "credit", 0m, 100m);
        voucher.Post("JV-0001", "tester");
        _db.Vouchers.Add(voucher);
        await _db.SaveChangesAsync();

        var handler = new DeleteVoucherCommandHandler(_db);

        await Should.ThrowAsync<FSH.Framework.Core.Exceptions.CustomException>(
            () => handler.Handle(new DeleteVoucherCommand(voucher.Id), CancellationToken.None).AsTask());

        (await _db.Vouchers.AnyAsync(v => v.Id == voucher.Id)).ShouldBeTrue();
    }

    [Fact]
    public async Task Handle_Should_Throw_When_VoucherNotFound()
    {
        var handler = new DeleteVoucherCommandHandler(_db);

        await Should.ThrowAsync<FSH.Framework.Core.Exceptions.NotFoundException>(
            () => handler.Handle(new DeleteVoucherCommand(Guid.CreateVersion7()), CancellationToken.None).AsTask());
    }

    public void Dispose() => _db.Dispose();
}
