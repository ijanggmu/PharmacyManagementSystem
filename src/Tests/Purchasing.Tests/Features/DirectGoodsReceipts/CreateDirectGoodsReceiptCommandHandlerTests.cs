using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.v1.DirectGoodsReceipts;
using FSH.Modules.Purchasing.Features.v1.DirectGoodsReceipts.CreateDirectGoodsReceipt;
using FSH.Modules.Purchasing.Services;
using Mediator;
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
    private readonly Guid _pricedMedicine = Guid.CreateVersion7();
    private readonly Guid _inactiveSupplier = Guid.CreateVersion7();
    private readonly Guid _missingSupplier = Guid.CreateVersion7();
    private readonly Guid _missingMedicine = Guid.CreateVersion7();
    private readonly CreateDirectGoodsReceiptCommandHandler _sut;

    public CreateDirectGoodsReceiptCommandHandlerTests()
    {
        _currentUser.GetTenant().Returns("test-tenant");
        _currentUser.Name.Returns("clerk1");
        _currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(ResolvedBranchId);

        // Inventory answers one lot per line, in line order.
        _stockReceiptService
            .ReceiveAsync(Arg.Any<StockReceiptRequest>(), Arg.Any<CancellationToken>())
            .Returns(ci => (IReadOnlyList<StockReceiptLineResult>)ci.Arg<StockReceiptRequest>().Lines
                .Select(l => new StockReceiptLineResult(l.MedicineId, Guid.CreateVersion7(), l.BatchNo!.ToUpperInvariant(), l.Quantity))
                .ToList());

        _receiptNumbers.ResolveBranchCodeAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>()).Returns("MAIN");
        _receiptNumbers.ReserveNextAsync(Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>()).Returns(7);

        IMediator mediator = NamesMediator.Create(
            inactiveSuppliers: [_inactiveSupplier],
            missingSuppliers: [_missingSupplier],
            medicinePrices: new Dictionary<Guid, decimal> { [_pricedMedicine] = 18m },
            missingMedicines: [_missingMedicine]);

        _sut = new CreateDirectGoodsReceiptCommandHandler(_db, _stockReceiptService, _outbox, _currentUser, _currentBranch, _receiptNumbers, mediator);
    }

    private static DirectGoodsReceiptLineInput Line(Guid medicineId, decimal? sellingPrice = null) =>
        new(medicineId, "b001", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 10m, 5m, SellingPrice: sellingPrice);

    #region Happy Path

    [Fact]
    public async Task Handle_Should_Assign_Serial_Number_With_Branch_And_FiscalYear()
    {
        // 2026-10-09 falls in Nepali fiscal year 2083/84 (1 Shrawan 2083 = 2026-07-17).
        var command = new CreateDirectGoodsReceiptCommand(
            Guid.CreateVersion7(), new DateTime(2026, 10, 9, 6, 0, 0, DateTimeKind.Utc), "INV-100",
            [Line(Guid.CreateVersion7())]);

        var receiptId = await _sut.Handle(command, CancellationToken.None);

        var receipt = await _db.DirectGoodsReceipts.SingleAsync(r => r.Id == receiptId);
        receipt.ReceiptNumber.ShouldBe("GRN-MAIN-2083/84-00007");
        receipt.FiscalYear.ShouldBe(2083);
        await _receiptNumbers.Received(1).ReserveNextAsync(ResolvedBranchId, 2083, Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_Should_Stamp_BranchId_Resolved_Via_ICurrentBranch()
    {
        var command = new CreateDirectGoodsReceiptCommand(Guid.CreateVersion7(), DateTime.UtcNow, "INV-100", [Line(Guid.CreateVersion7())]);

        var receiptId = await _sut.Handle(command, CancellationToken.None);

        var saved = await _db.DirectGoodsReceipts.Include(r => r.Lines).FirstAsync(r => r.Id == receiptId);
        saved.BranchId.ShouldBe(ResolvedBranchId);
        saved.Lines.Single().BranchId.ShouldBe(ResolvedBranchId);
    }

    [Fact]
    public async Task Handle_Should_Call_RequireBranchIdAsync_Exactly_Once()
    {
        var command = new CreateDirectGoodsReceiptCommand(Guid.CreateVersion7(), DateTime.UtcNow, null, [Line(Guid.CreateVersion7())]);

        await _sut.Handle(command, CancellationToken.None);

        await _currentBranch.Received(1).RequireBranchIdAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_Should_Record_The_Lot_Each_Line_Went_Into()
    {
        var command = new CreateDirectGoodsReceiptCommand(Guid.CreateVersion7(), DateTime.UtcNow, null, [Line(Guid.CreateVersion7())]);

        var receiptId = await _sut.Handle(command, CancellationToken.None);

        var line = (await _db.DirectGoodsReceipts.Include(r => r.Lines).FirstAsync(r => r.Id == receiptId)).Lines.Single();
        line.BatchId.ShouldNotBeNull();
        line.BatchNo.ShouldBe("B001");
    }

    [Fact]
    public async Task Handle_Should_Receive_Stock_At_The_Receipt_Branch_Joining_The_Caller_Transaction()
    {
        var command = new CreateDirectGoodsReceiptCommand(Guid.CreateVersion7(), DateTime.UtcNow, null, [Line(Guid.CreateVersion7())]);

        await _sut.Handle(command, CancellationToken.None);

        await _stockReceiptService.Received(1).ReceiveAsync(
            Arg.Is<StockReceiptRequest>(r => r.JoinCallerTransaction && r.BranchId == ResolvedBranchId && r.ReferenceType == "DirectGoodsReceipt"),
            Arg.Any<CancellationToken>());
    }

    #endregion

    #region Selling price

    [Fact]
    public async Task Handle_Should_Price_The_Lot_At_The_Given_Selling_Price()
    {
        var command = new CreateDirectGoodsReceiptCommand(Guid.CreateVersion7(), DateTime.UtcNow, null, [Line(_pricedMedicine, sellingPrice: 25m)]);

        await _sut.Handle(command, CancellationToken.None);

        await _stockReceiptService.Received(1).ReceiveAsync(
            Arg.Is<StockReceiptRequest>(r => r.Lines.Single().SellingPrice == 25m && r.Lines.Single().CostPrice == 5m),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_Should_Price_The_Lot_At_The_Catalog_Price_When_None_Is_Given_Not_At_Cost()
    {
        var command = new CreateDirectGoodsReceiptCommand(Guid.CreateVersion7(), DateTime.UtcNow, null, [Line(_pricedMedicine)]);

        await _sut.Handle(command, CancellationToken.None);

        await _stockReceiptService.Received(1).ReceiveAsync(
            Arg.Is<StockReceiptRequest>(r => r.Lines.Single().SellingPrice == 18m),
            Arg.Any<CancellationToken>());
    }

    #endregion

    #region Supplier

    [Fact]
    public async Task Handle_Should_Reject_An_Inactive_Supplier_Before_Any_Stock_Moves()
    {
        var command = new CreateDirectGoodsReceiptCommand(_inactiveSupplier, DateTime.UtcNow, null, [Line(Guid.CreateVersion7())]);

        var ex = await Should.ThrowAsync<CustomException>(() => _sut.Handle(command, CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        await _stockReceiptService.DidNotReceiveWithAnyArgs().ReceiveAsync(default!, default);
        _db.DirectGoodsReceipts.ShouldBeEmpty();
    }

    [Fact]
    public async Task Handle_Should_Reject_An_Unknown_Supplier()
    {
        var command = new CreateDirectGoodsReceiptCommand(_missingSupplier, DateTime.UtcNow, null, [Line(Guid.CreateVersion7())]);

        var ex = await Should.ThrowAsync<CustomException>(() => _sut.Handle(command, CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        await _stockReceiptService.DidNotReceiveWithAnyArgs().ReceiveAsync(default!, default);
    }

    #endregion

    [Fact]
    public async Task Handle_Should_404_For_An_Unknown_Medicine_Even_When_The_Line_Carries_A_Selling_Price()
    {
        var command = new CreateDirectGoodsReceiptCommand(
            Guid.CreateVersion7(), DateTime.UtcNow, "INV-404", [Line(_missingMedicine, sellingPrice: 25m)]);

        await Should.ThrowAsync<NotFoundException>(() => _sut.Handle(command, CancellationToken.None).AsTask());

        await _stockReceiptService.DidNotReceiveWithAnyArgs().ReceiveAsync(default!, default);
    }

    [Fact]
    public void Validator_Should_Reject_A_Future_Or_Unsupported_Receipt_Date()
    {
        var validator = new CreateDirectGoodsReceiptCommandValidator();
        var line = Line(Guid.CreateVersion7());

        validator.Validate(new CreateDirectGoodsReceiptCommand(Guid.CreateVersion7(), DateTime.UtcNow.AddDays(3), "INV-1", [line]))
            .IsValid.ShouldBeFalse();
        validator.Validate(new CreateDirectGoodsReceiptCommand(Guid.CreateVersion7(), new DateTime(2010, 1, 1, 0, 0, 0, DateTimeKind.Utc), "INV-1", [line]))
            .IsValid.ShouldBeFalse();
        validator.Validate(new CreateDirectGoodsReceiptCommand(Guid.CreateVersion7(), DateTime.UtcNow, "INV-1", [line]))
            .IsValid.ShouldBeTrue();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Validator_Should_Require_The_Supplier_Bill_Number(string? invoiceNumber)
    {
        new CreateDirectGoodsReceiptCommandValidator()
            .Validate(new CreateDirectGoodsReceiptCommand(Guid.CreateVersion7(), DateTime.UtcNow, invoiceNumber, [Line(Guid.CreateVersion7())]))
            .IsValid.ShouldBeFalse();
    }

    public void Dispose() => _db.Dispose();
}
