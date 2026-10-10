using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.v1.DirectGoodsReceipts;
using FSH.Modules.Purchasing.Features.v1.DirectGoodsReceipts.CreateDirectGoodsReceipt;
using FSH.Modules.Purchasing.Services;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Purchasing.Tests.Features;

namespace Purchasing.Tests.Features.DirectGoodsReceipts;

public sealed class CreateDirectGoodsReceiptCommandHandlerTests : IDisposable
{
    private static readonly Guid ResolvedBranchId = Guid.CreateVersion7();

    private readonly FSH.Modules.Purchasing.Data.PurchasingDbContext _db = PurchasingDbContextFactory.Create();
    private readonly IStockReceiptService _stockReceiptService = Substitute.For<IStockReceiptService>();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly IReceiptNumberService _receiptNumbers = Substitute.For<IReceiptNumberService>();
    private readonly CreateDirectGoodsReceiptCommandHandler _sut;

    public CreateDirectGoodsReceiptCommandHandlerTests()
    {
        _currentUser.GetTenant().Returns("test-tenant");
        _currentUser.Name.Returns("clerk1");
        _currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(ResolvedBranchId);
        _stockReceiptService
            .ReceiveAsync(Arg.Any<StockReceiptRequest>(), Arg.Any<CancellationToken>())
            .Returns(new List<StockReceiptLineResult>());

        _receiptNumbers.ResolveBranchCodeAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>()).Returns("MAIN");
        _receiptNumbers.ReserveNextAsync(Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>()).Returns(7);

        _sut = new CreateDirectGoodsReceiptCommandHandler(_db, _stockReceiptService, _outbox, _currentUser, _currentBranch, _receiptNumbers);
    }

    #region Happy Path

    [Fact]
    public async Task Handle_Should_Assign_Serial_Number_With_Branch_And_FiscalYear()
    {
        // 2026-10-09 falls in Nepali fiscal year 2083/84 (1 Shrawan 2083 = 2026-07-17).
        var command = new CreateDirectGoodsReceiptCommand(
            Guid.CreateVersion7(), new DateTime(2026, 10, 9, 6, 0, 0, DateTimeKind.Utc), "INV-100",
            [new DirectGoodsReceiptLineInput(Guid.CreateVersion7(), "B001", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 10m, 5m)]);

        var receiptId = await _sut.Handle(command, CancellationToken.None);

        var receipt = await _db.DirectGoodsReceipts.SingleAsync(r => r.Id == receiptId);
        receipt.ReceiptNumber.ShouldBe("GRN-MAIN-2083/84-00007");
        receipt.FiscalYear.ShouldBe(2083);
        await _receiptNumbers.Received(1).ReserveNextAsync(ResolvedBranchId, 2083, Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_Should_Stamp_BranchId_Resolved_Via_ICurrentBranch()
    {
        var command = new CreateDirectGoodsReceiptCommand(
            Guid.CreateVersion7(), DateTime.UtcNow, "INV-100",
            [new DirectGoodsReceiptLineInput(Guid.CreateVersion7(), "B001", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 10m, 5m)]);

        var receiptId = await _sut.Handle(command, CancellationToken.None);

        var saved = await _db.DirectGoodsReceipts.Include(r => r.Lines).FirstAsync(r => r.Id == receiptId);
        saved.BranchId.ShouldBe(ResolvedBranchId);
        saved.Lines.Single().BranchId.ShouldBe(ResolvedBranchId);
    }

    [Fact]
    public async Task Handle_Should_Call_RequireBranchIdAsync_Exactly_Once()
    {
        var command = new CreateDirectGoodsReceiptCommand(
            Guid.CreateVersion7(), DateTime.UtcNow, null,
            [new DirectGoodsReceiptLineInput(Guid.CreateVersion7(), "B001", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 10m, 5m)]);

        await _sut.Handle(command, CancellationToken.None);

        await _currentBranch.Received(1).RequireBranchIdAsync(Arg.Any<CancellationToken>());
    }

    #endregion

    public void Dispose() => _db.Dispose();
}
