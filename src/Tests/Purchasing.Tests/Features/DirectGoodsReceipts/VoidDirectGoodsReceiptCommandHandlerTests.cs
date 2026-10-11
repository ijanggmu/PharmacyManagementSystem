using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.Events;
using FSH.Modules.Purchasing.Contracts.v1.DirectGoodsReceipts;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using FSH.Modules.Purchasing.Features.v1.DirectGoodsReceipts.VoidDirectGoodsReceipt;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Purchasing.Tests.Features.DirectGoodsReceipts;

/// <summary>Voiding a direct receipt takes its stock back out of the lots it created, at its own branch,
/// once — and only for a caller who can see that branch.</summary>
public sealed class VoidDirectGoodsReceiptCommandHandlerTests : IDisposable
{
    private readonly PurchasingDbContext _db = PurchasingDbContextFactory.Create();
    private readonly IStockReceiptService _stock = Substitute.For<IStockReceiptService>();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly Guid _receiptBranch = Guid.CreateVersion7();
    private readonly Guid _callerBranch = Guid.CreateVersion7();
    private readonly VoidDirectGoodsReceiptCommandHandler _sut;

    public VoidDirectGoodsReceiptCommandHandlerTests()
    {
        _currentUser.Name.Returns("manager1");
        _currentUser.GetTenant().Returns("test-tenant");
        _stock.ReverseReceiptAsync(Arg.Any<StockReceiptReversalRequest>(), Arg.Any<CancellationToken>())
            .Returns(new List<StockReceiptReversalLineResult>());
        _sut = new VoidDirectGoodsReceiptCommandHandler(_db, _stock, _outbox, _currentUser, _currentBranch);
    }

    private void CallerSeesAllBranches()
    {
        _currentBranch.CanViewAllBranchesAsync(Arg.Any<CancellationToken>()).Returns(true);
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_callerBranch);
    }

    private void CallerPinnedToOwnBranch()
    {
        _currentBranch.CanViewAllBranchesAsync(Arg.Any<CancellationToken>()).Returns(false);
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_callerBranch);
    }

    private async Task<(DirectGoodsReceipt Receipt, Guid BatchId)> SeedReceiptAsync()
    {
        var medicineId = Guid.CreateVersion7();
        var batchId = Guid.CreateVersion7();
        var receipt = DirectGoodsReceipt.Create(Guid.CreateVersion7(), DateTime.UtcNow, "BILL-1", "clerk1", _receiptBranch);
        receipt.AddLine(medicineId, 10m, 5m, 0m);
        receipt.RecordLots([(medicineId, batchId, "LOT-1")]);
        _db.DirectGoodsReceipts.Add(receipt);
        await _db.SaveChangesAsync();
        _db.ChangeTracker.Clear();
        return (receipt, batchId);
    }

    [Fact]
    public async Task Void_Should_Reverse_The_Receipts_Own_Lots_At_The_Receipt_Branch()
    {
        CallerSeesAllBranches();
        var (receipt, batchId) = await SeedReceiptAsync();

        await _sut.Handle(new VoidDirectGoodsReceiptCommand(receipt.Id, "Wrong supplier"), CancellationToken.None);

        await _stock.Received(1).ReverseReceiptAsync(
            Arg.Is<StockReceiptReversalRequest>(r =>
                r.BranchId == _receiptBranch
                && r.JoinCallerTransaction
                && r.OriginalReferenceType == "DirectGoodsReceipt" && r.OriginalReferenceId == receipt.Id
                && r.Lines.Single().BatchId == batchId && r.Lines.Single().Quantity == 10m),
            Arg.Any<CancellationToken>());
        await _outbox.Received(1).AddAsync(
            Arg.Is<DirectGoodsReceiptVoidedIntegrationEvent>(e => e.ReceiptId == receipt.Id && e.BranchId == _receiptBranch),
            Arg.Any<CancellationToken>());
        (await _db.DirectGoodsReceipts.AsNoTracking().SingleAsync()).Status.ShouldBe(DirectGoodsReceiptStatus.Voided);
    }

    [Fact]
    public async Task A_Second_Void_Should_Fail_Without_Reversing_Stock_Again()
    {
        CallerSeesAllBranches();
        var (receipt, _) = await SeedReceiptAsync();
        await _sut.Handle(new VoidDirectGoodsReceiptCommand(receipt.Id, "Wrong supplier"), CancellationToken.None);
        _stock.ClearReceivedCalls();
        _db.ChangeTracker.Clear();

        var ex = await Should.ThrowAsync<CustomException>(() =>
            _sut.Handle(new VoidDirectGoodsReceiptCommand(receipt.Id, "again"), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        await _stock.DidNotReceiveWithAnyArgs().ReverseReceiptAsync(default!, default);
    }

    [Fact]
    public async Task A_Caller_Pinned_To_Another_Branch_Should_Not_Find_The_Receipt()
    {
        CallerPinnedToOwnBranch();
        var (receipt, _) = await SeedReceiptAsync();

        await Should.ThrowAsync<NotFoundException>(() =>
            _sut.Handle(new VoidDirectGoodsReceiptCommand(receipt.Id, "nope"), CancellationToken.None).AsTask());

        await _stock.DidNotReceiveWithAnyArgs().ReverseReceiptAsync(default!, default);
        (await _db.DirectGoodsReceipts.AsNoTracking().SingleAsync()).Status.ShouldBe(DirectGoodsReceiptStatus.Received);
    }

    [Fact]
    public async Task A_Failed_Reversal_Should_Leave_The_Receipt_Received()
    {
        CallerSeesAllBranches();
        var (receipt, _) = await SeedReceiptAsync();
        _stock.ReverseReceiptAsync(Arg.Any<StockReceiptReversalRequest>(), Arg.Any<CancellationToken>())
            .Returns<IReadOnlyList<StockReceiptReversalLineResult>>(_ => throw new CustomException("sold", (IEnumerable<string>?)null, HttpStatusCode.Conflict));

        await Should.ThrowAsync<CustomException>(() =>
            _sut.Handle(new VoidDirectGoodsReceiptCommand(receipt.Id, "Wrong supplier"), CancellationToken.None).AsTask());

        _db.ChangeTracker.Clear();
        (await _db.DirectGoodsReceipts.AsNoTracking().SingleAsync()).Status.ShouldBe(DirectGoodsReceiptStatus.Received);
        await _outbox.DidNotReceiveWithAnyArgs().AddAsync(default!, default);
    }

    public void Dispose() => _db.Dispose();
}
