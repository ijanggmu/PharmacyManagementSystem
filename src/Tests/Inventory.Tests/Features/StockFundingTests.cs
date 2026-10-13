using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Events;
using FSH.Modules.Inventory.Contracts.v1.Batches;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Features.v1.Batches.CreateBatch;
using FSH.Modules.Inventory.Features.v1.Medicines.AddMedicineStock;
using FSH.Modules.Inventory.Features.v1.Medicines.CreateMedicine;
using FSH.Modules.Inventory.Features.v1.Medicines.UpdateMedicine;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using NSubstitute;

namespace Inventory.Tests.Features;

/// <summary>Stock without a supplier bill says how it was paid for (opening stock / cash / bank), and the
/// opening-stock event carries it so Accounting credits Owner's Equity, Cash or Bank.</summary>
public sealed class StockFundingTests : IDisposable
{
    private readonly InventoryDbContext _db = InventoryDbContextFactory.Create();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly List<IIntegrationEvent> _events = [];

    public StockFundingTests()
    {
        _currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(Guid.CreateVersion7());
        _outbox.AddAsync(Arg.Do<IIntegrationEvent>(_events.Add), Arg.Any<CancellationToken>()).Returns(Task.CompletedTask);
    }

    private async Task<Medicine> SeedMedicineAsync()
    {
        var medicine = Medicine.Create("Paracetamol", null, null, reorderLevel: 5, isControlled: false);
        _db.Medicines.Add(medicine);
        await _db.SaveChangesAsync();
        return medicine;
    }

    private OpeningStockReceivedIntegrationEvent SingleOpeningStockEvent() =>
        _events.OfType<OpeningStockReceivedIntegrationEvent>().ShouldHaveSingleItem();

    [Theory]
    [InlineData(null, StockFundingSources.OpeningStock)]
    [InlineData(StockFundingSources.OpeningStock, StockFundingSources.OpeningStock)]
    [InlineData(StockFundingSources.Cash, StockFundingSources.Cash)]
    [InlineData("Bank", StockFundingSources.Bank)]
    public async Task CreateBatch_Should_CarryFundingOnEvent(string? funding, string expected)
    {
        var medicine = await SeedMedicineAsync();
        var sut = new CreateBatchCommandHandler(_db, _currentBranch, _outbox, Substitute.For<ICurrentUser>());

        await sut.Handle(
            new CreateBatchCommand(medicine.Id, "B001", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 20m, 5m, 10m,
                StockFunding: funding),
            CancellationToken.None);

        var opening = SingleOpeningStockEvent();
        opening.Amount.ShouldBe(100m);
        opening.Funding.ShouldBe(expected);
        if (expected == StockFundingSources.OpeningStock)
        {
            opening.Narration.ShouldBe("Opening stock: batch B001");
        }
        else
        {
            opening.Narration.ShouldContain("no supplier bill");
        }
    }

    [Fact]
    public async Task AddMedicineStock_Should_CarryCashFunding_When_NoSupplier()
    {
        var medicine = await SeedMedicineAsync();
        var sut = new AddMedicineStockCommandHandler(
            _db, new StockReceiptService(_db, _currentBranch), _outbox, Substitute.For<ICurrentUser>(), _currentBranch);

        await sut.Handle(
            new AddMedicineStockCommand(medicine.Id, 10m, CostPrice: 4m, StockFunding: StockFundingSources.Cash),
            CancellationToken.None);

        var opening = SingleOpeningStockEvent();
        opening.Amount.ShouldBe(40m);
        opening.Funding.ShouldBe(StockFundingSources.Cash);
    }

    [Fact]
    public async Task CreateMedicine_Should_CarryBankFunding_OnOpeningStock()
    {
        var sut = new CreateMedicineCommandHandler(
            _db, new StockReceiptService(_db, _currentBranch), _outbox, Substitute.For<ICurrentUser>(), _currentBranch);

        await sut.Handle(
            new CreateMedicineCommand("Amoxicillin", InitialStockQuantity: 5m, CostPrice: 2m, StockFunding: StockFundingSources.Bank),
            CancellationToken.None);

        SingleOpeningStockEvent().Funding.ShouldBe(StockFundingSources.Bank);
    }

    [Fact]
    public async Task UpdateMedicine_Should_CarryFunding_When_ReceivingANewLotWithoutSupplier()
    {
        var medicine = await SeedMedicineAsync();
        var sut = new UpdateMedicineCommandHandler(
            _db, new StockReceiptService(_db, _currentBranch), _currentBranch, _outbox, Substitute.For<ICurrentUser>());

        await sut.Handle(
            new UpdateMedicineCommand(medicine.Id, medicine.Name, InitialStockQuantity: 3m, CostPrice: 10m,
                StockFunding: StockFundingSources.Cash),
            CancellationToken.None);

        var opening = SingleOpeningStockEvent();
        opening.Amount.ShouldBe(30m);
        opening.Funding.ShouldBe(StockFundingSources.Cash);
    }

    [Theory]
    [InlineData(StockFundingSources.Cash)]
    [InlineData(StockFundingSources.Bank)]
    public void Validators_Should_RejectCashOrBankFunding_WithASupplier(string funding)
    {
        var supplierId = Guid.CreateVersion7();

        new AddMedicineStockCommandValidator()
            .Validate(new AddMedicineStockCommand(Guid.CreateVersion7(), 1m, SupplierId: supplierId, StockFunding: funding))
            .Errors.ShouldContain(e => e.PropertyName == nameof(AddMedicineStockCommand.StockFunding));
        new CreateMedicineCommandValidator()
            .Validate(new CreateMedicineCommand("X", InitialStockQuantity: 1m, SupplierId: supplierId, StockFunding: funding))
            .Errors.ShouldContain(e => e.PropertyName == nameof(CreateMedicineCommand.StockFunding));
        new UpdateMedicineCommandValidator()
            .Validate(new UpdateMedicineCommand(Guid.CreateVersion7(), "X", InitialStockQuantity: 1m, SupplierId: supplierId, StockFunding: funding))
            .Errors.ShouldContain(e => e.PropertyName == nameof(UpdateMedicineCommand.StockFunding));
    }

    [Theory]
    [InlineData(null)]
    [InlineData(StockFundingSources.OpeningStock)]
    public void Validators_Should_AllowOpeningStockOrNoFunding_WithASupplier(string? funding)
    {
        new AddMedicineStockCommandValidator()
            .Validate(new AddMedicineStockCommand(Guid.CreateVersion7(), 1m, SupplierId: Guid.CreateVersion7(), StockFunding: funding))
            .IsValid.ShouldBeTrue();
    }

    [Fact]
    public void Validators_Should_AcceptCashFunding_WithoutASupplier()
    {
        new AddMedicineStockCommandValidator()
            .Validate(new AddMedicineStockCommand(Guid.CreateVersion7(), 1m, StockFunding: StockFundingSources.Cash))
            .IsValid.ShouldBeTrue();
        new CreateBatchCommandValidator()
            .Validate(new CreateBatchCommand(Guid.CreateVersion7(), "B1", new DateOnly(2030, 1, 1), 1m, 1m, 1m, StockFunding: "bank"))
            .IsValid.ShouldBeTrue();
    }

    [Fact]
    public void Validators_Should_RejectUnknownFunding()
    {
        new CreateBatchCommandValidator()
            .Validate(new CreateBatchCommand(Guid.CreateVersion7(), "B1", new DateOnly(2030, 1, 1), 1m, 1m, 1m, StockFunding: "cheque"))
            .Errors.ShouldContain(e => e.PropertyName == nameof(CreateBatchCommand.StockFunding));
        new AddMedicineStockCommandValidator()
            .Validate(new AddMedicineStockCommand(Guid.CreateVersion7(), 1m, StockFunding: "credit"))
            .IsValid.ShouldBeFalse();
    }

    public void Dispose() => _db.Dispose();
}
