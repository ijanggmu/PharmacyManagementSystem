using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Expenses;
using FSH.Modules.Accounting.Contracts.v1.Vouchers;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.Expenses.DeleteExpense;
using FSH.Modules.Accounting.Features.v1.Expenses.UpdateExpense;
using FSH.Modules.Accounting.Features.v1.Vouchers.VoidVoucher;
using FSH.Modules.Accounting.IntegrationEventHandlers;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.Events;
using FSH.Modules.Sales.Contracts.Events;
using FSH.Modules.Accounting.Services;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Accounting.Tests.Features.Vouchers;

/// <summary>System vouchers carry the event's business date; cancellations reverse instead of void; the
/// single-record command handlers refuse records of another branch.</summary>
public sealed class SystemVoucherDatingAndBranchTests : IDisposable
{
    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();
    private readonly IVoucherPostingService _posting = Substitute.For<IVoucherPostingService>();
    private readonly IAccountingAccountResolver _resolver = Substitute.For<IAccountingAccountResolver>();
    private readonly ICurrentBranch _pinnedToOtherBranch = Substitute.For<ICurrentBranch>();

    public SystemVoucherDatingAndBranchTests()
    {
        _resolver.ResolveByCodeAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(_ => Guid.CreateVersion7());
        _pinnedToOtherBranch.CanViewAllBranchesAsync(Arg.Any<CancellationToken>()).Returns(false);
        _pinnedToOtherBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(Guid.CreateVersion7());
    }

    public void Dispose() => _db.Dispose();

    [Fact]
    public async Task SaleCompleted_Should_DateVoucher_AtTheSale()
    {
        var saleTime = new DateTime(2026, 5, 1, 4, 0, 0, DateTimeKind.Utc);
        var @event = new SaleCompletedIntegrationEvent(
            Guid.NewGuid(), saleTime, "t", "c", "Sales", Guid.CreateVersion7(), Guid.CreateVersion7(), null, null,
            "cash", 113m, 113m, 0m, 13m, 60m, []);

        await new SaleCompletedIntegrationEventHandler(_posting, _resolver).HandleAsync(@event);

        await _posting.Received(1).PostSystemVoucherAsync(
            Arg.Is<PostVoucherRequest>(r => r.VoucherDateUtc == saleTime), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task SaleCancelled_Should_Reverse_AtTheCancellationDate()
    {
        var cancelTime = new DateTime(2026, 5, 3, 4, 0, 0, DateTimeKind.Utc);
        var saleId = Guid.CreateVersion7();

        await new SaleCancelledIntegrationEventHandler(_posting).HandleAsync(
            new SaleCancelledIntegrationEvent(Guid.NewGuid(), cancelTime, "t", "c", "Sales", saleId, "wrong item", []));

        await _posting.Received(1).ReverseSystemVoucherAsync("Sale", saleId, Arg.Any<string>(), cancelTime, Arg.Any<CancellationToken>());
        await _posting.DidNotReceiveWithAnyArgs().VoidAsync(Guid.Empty, default!, default);
    }

    [Fact]
    public async Task DirectGoodsReceiptVoided_Should_Reverse_NotVoid()
    {
        var voidTime = new DateTime(2026, 5, 3, 4, 0, 0, DateTimeKind.Utc);
        var receiptId = Guid.CreateVersion7();

        await new DirectGoodsReceiptVoidedIntegrationEventHandler(_posting).HandleAsync(
            new DirectGoodsReceiptVoidedIntegrationEvent(
                Guid.NewGuid(), voidTime, "t", "c", "Purchasing", receiptId, Guid.CreateVersion7(), 100m, voidTime.AddDays(-2), "dup"));

        await _posting.Received(1).ReverseSystemVoucherAsync("DirectGoodsReceipt", receiptId, Arg.Any<string>(), voidTime, Arg.Any<CancellationToken>());
        await _posting.DidNotReceiveWithAnyArgs().VoidAsync(Guid.Empty, default!, default);
    }

    [Fact]
    public async Task VoidVoucher_Should_Hide_OtherBranchVouchers()
    {
        var voucher = AccountingVoucher.CreateDraft(DateTime.UtcNow, "journal", AccountingVoucherSource.Manual, null, branchId: Guid.CreateVersion7());
        voucher.AddLine(Guid.CreateVersion7(), null, 5m, 0m);
        voucher.AddLine(Guid.CreateVersion7(), null, 0m, 5m);
        voucher.Post("MJ-1", "tester");
        _db.Vouchers.Add(voucher);
        await _db.SaveChangesAsync();

        await Should.ThrowAsync<NotFoundException>(() => new VoidVoucherCommandHandler(_posting, _db, _pinnedToOtherBranch)
            .Handle(new VoidVoucherCommand(voucher.Id, "x"), CancellationToken.None).AsTask());
        await _posting.DidNotReceiveWithAnyArgs().VoidAsync(Guid.Empty, default!, default);
    }

    [Fact]
    public async Task UpdateAndDeleteExpense_Should_Hide_OtherBranchExpenses()
    {
        var expense = Expense.Create(DateTime.UtcNow, "Rent", 10m, "cash", null, "tester", Guid.CreateVersion7());
        _db.Expenses.Add(expense);
        await _db.SaveChangesAsync();
        var user = Substitute.For<ICurrentUser>();

        var realPosting = TestVoucherPosting.Create(_db);
        await Should.ThrowAsync<NotFoundException>(() => new UpdateExpenseCommandHandler(_db, realPosting, _resolver, user, _pinnedToOtherBranch, new AccountingPostingLockService(_db))
            .Handle(new UpdateExpenseCommand(expense.Id, "Rent", 20m, "cash"), CancellationToken.None).AsTask());
        await Should.ThrowAsync<NotFoundException>(() => new DeleteExpenseCommandHandler(_db, realPosting, user, _pinnedToOtherBranch)
            .Handle(new DeleteExpenseCommand(expense.Id), CancellationToken.None).AsTask());
        (await _db.Vouchers.CountAsync()).ShouldBe(0);
    }
}
