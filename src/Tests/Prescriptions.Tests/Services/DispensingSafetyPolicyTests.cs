using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Prescriptions.Contracts.Services;
using FSH.Modules.Prescriptions.Data;
using FSH.Modules.Prescriptions.Domain;
using FSH.Modules.Prescriptions.Services;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Prescriptions.Tests.Features;

namespace Prescriptions.Tests.Services;

public sealed class DispensingSafetyPolicyTests : IDisposable
{
    private static readonly DateTimeOffset Now = new(2026, 6, 15, 12, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly Today = DateOnly.FromDateTime(Now.UtcDateTime);

    private readonly PrescriptionsDbContext _db = PrescriptionsDbContextFactory.Create();
    private readonly IControlledMedicineChecker _controlledMedicineChecker = Substitute.For<IControlledMedicineChecker>();
    private readonly TimeProvider _timeProvider = Substitute.For<TimeProvider>();
    private readonly DispensingSafetyPolicy _sut;

    public DispensingSafetyPolicyTests()
    {
        _timeProvider.GetUtcNow().Returns(Now);
        _sut = new DispensingSafetyPolicy(_db, _controlledMedicineChecker, _timeProvider);
    }

    #region Happy Path

    [Fact]
    public async Task EnsureDispensableAsync_Should_NotThrow_When_ControlledItemHasValidActivePrescriptionForCustomer()
    {
        // Arrange
        var customerId = Guid.CreateVersion7();
        var medicineId = Guid.CreateVersion7();
        var prescriptionId = await SeedPrescriptionAsync(
            customerId, medicineId, prescriptionDate: Today.AddDays(-7), expiryDate: Today.AddDays(30));
        SetControlled(medicineId, isControlled: true);

        // Act & Assert
        await Should.NotThrowAsync(async () =>
            await _sut.EnsureDispensableAsync(
                [new DispenseCheckLine(medicineId, 10m)], prescriptionId, customerId, CancellationToken.None));
    }

    [Fact]
    public async Task EnsureDispensableAsync_Should_NotRequirePrescription_When_ItemIsNotControlled()
    {
        // Arrange
        var customerId = Guid.CreateVersion7();
        var medicineId = Guid.CreateVersion7();
        SetControlled(medicineId, isControlled: false);

        // Act & Assert
        await Should.NotThrowAsync(async () =>
            await _sut.EnsureDispensableAsync(
                [new DispenseCheckLine(medicineId, 10m)], prescriptionId: null, customerId, CancellationToken.None));
    }

    #endregion

    #region Exception

    [Fact]
    public async Task EnsureDispensableAsync_Should_ThrowDispensingSafetyException_When_ControlledItemHasNoPrescription()
    {
        // Arrange
        var customerId = Guid.CreateVersion7();
        var medicineId = Guid.CreateVersion7();
        SetControlled(medicineId, isControlled: true);

        // Act & Assert
        await Should.ThrowAsync<DispensingSafetyException>(async () =>
            await _sut.EnsureDispensableAsync(
                [new DispenseCheckLine(medicineId, 10m)], prescriptionId: null, customerId, CancellationToken.None));
    }

    [Fact]
    public async Task EnsureDispensableAsync_Should_ThrowDispensingSafetyException_When_ControlledItemPrescriptionIsExpired()
    {
        // Arrange
        var customerId = Guid.CreateVersion7();
        var medicineId = Guid.CreateVersion7();
        var prescriptionId = await SeedPrescriptionAsync(
            customerId, medicineId, prescriptionDate: Today.AddDays(-60), expiryDate: Today.AddDays(-1));
        SetControlled(medicineId, isControlled: true);

        // Act & Assert
        await Should.ThrowAsync<DispensingSafetyException>(async () =>
            await _sut.EnsureDispensableAsync(
                [new DispenseCheckLine(medicineId, 10m)], prescriptionId, customerId, CancellationToken.None));
    }

    #endregion

    #region Multi-line and Recording

    [Fact]
    public async Task EnsureDispensableAsync_Should_NotThrow_When_SameMedicineLinesTotalWithinRemainingQuantity()
    {
        // Arrange
        var customerId = Guid.CreateVersion7();
        var medicineId = Guid.CreateVersion7();
        var prescriptionId = await SeedPrescriptionWithItemsAsync(customerId, (medicineId, 30m));
        SetControlled(medicineId, isControlled: true);

        // Act & Assert
        await Should.NotThrowAsync(async () =>
            await _sut.EnsureDispensableAsync(
                [new DispenseCheckLine(medicineId, 15m), new DispenseCheckLine(medicineId, 15m)],
                prescriptionId, customerId, CancellationToken.None));
    }

    [Fact]
    public async Task EnsureDispensableAsync_Should_ThrowDispensingSafetyException_When_SameMedicineLinesExceedRemainingQuantity()
    {
        // Arrange: each line (20) fits 30 remaining on its own, but together they do not.
        var customerId = Guid.CreateVersion7();
        var medicineId = Guid.CreateVersion7();
        var prescriptionId = await SeedPrescriptionWithItemsAsync(customerId, (medicineId, 30m));
        SetControlled(medicineId, isControlled: true);

        // Act & Assert
        await Should.ThrowAsync<DispensingSafetyException>(async () =>
            await _sut.EnsureDispensableAsync(
                [new DispenseCheckLine(medicineId, 20m), new DispenseCheckLine(medicineId, 20m)],
                prescriptionId, customerId, CancellationToken.None));
    }

    [Fact]
    public async Task RecordDispenseAsync_Should_RecordOnlyControlledLines_When_SaleContainsUncontrolledLines()
    {
        // Arrange
        var customerId = Guid.CreateVersion7();
        var controlledId = Guid.CreateVersion7();
        var uncontrolledId = Guid.CreateVersion7();
        var prescriptionId = await SeedPrescriptionWithItemsAsync(customerId, (controlledId, 30m), (uncontrolledId, 30m));
        SetControlledStatus(new Dictionary<Guid, bool> { [controlledId] = true, [uncontrolledId] = false });

        // Act
        await _sut.RecordDispenseAsync(
            prescriptionId,
            [new DispenseCheckLine(controlledId, 10m), new DispenseCheckLine(uncontrolledId, 5m)],
            cancellationToken: CancellationToken.None);

        // Assert
        var prescription = await _db.Prescriptions.Include(p => p.Items).FirstAsync(p => p.Id == prescriptionId);
        var controlledItem = prescription.FindItem(controlledId)!;
        var uncontrolledItem = prescription.FindItem(uncontrolledId)!;
        controlledItem.DispensedQuantity.ShouldBe(10m);
        controlledItem.RefillsUsed.ShouldBe(1);
        uncontrolledItem.DispensedQuantity.ShouldBe(0m);
        uncontrolledItem.RefillsUsed.ShouldBe(0);
    }

    [Fact]
    public async Task RecordDispenseAsync_Should_RecordOneDispensePerItem_When_SameMedicineHasMultipleLines()
    {
        // Arrange
        var customerId = Guid.CreateVersion7();
        var medicineId = Guid.CreateVersion7();
        var prescriptionId = await SeedPrescriptionWithItemsAsync(customerId, (medicineId, 30m));
        SetControlled(medicineId, isControlled: true);

        // Act
        await _sut.RecordDispenseAsync(
            prescriptionId,
            [new DispenseCheckLine(medicineId, 10m), new DispenseCheckLine(medicineId, 10m)],
            cancellationToken: CancellationToken.None);

        // Assert: one sale consumes one refill slot and the accumulated quantity.
        var item = (await _db.Prescriptions.Include(p => p.Items).FirstAsync(p => p.Id == prescriptionId)).FindItem(medicineId)!;
        item.DispensedQuantity.ShouldBe(20m);
        item.RefillsUsed.ShouldBe(1);
    }

    #endregion

    #region Multi-line and Recording Exceptions

    [Fact]
    public async Task RecordDispenseAsync_Should_ThrowDispensingSafetyException_When_ControlledLineHasNoPrescriptionItem()
    {
        // Arrange
        var customerId = Guid.CreateVersion7();
        var listedId = Guid.CreateVersion7();
        var unlistedId = Guid.CreateVersion7();
        var prescriptionId = await SeedPrescriptionWithItemsAsync(customerId, (listedId, 30m));
        SetControlled(unlistedId, isControlled: true);

        // Act & Assert
        await Should.ThrowAsync<DispensingSafetyException>(async () =>
            await _sut.RecordDispenseAsync(
                prescriptionId, [new DispenseCheckLine(unlistedId, 10m)], cancellationToken: CancellationToken.None));
    }

    [Fact]
    public async Task RecordDispenseAsync_Should_ThrowDispensingSafetyExceptionWithoutPartialRecord_When_AccumulatedQuantityExceedsRemaining()
    {
        // Arrange
        var customerId = Guid.CreateVersion7();
        var medicineId = Guid.CreateVersion7();
        var prescriptionId = await SeedPrescriptionWithItemsAsync(customerId, (medicineId, 30m));
        SetControlled(medicineId, isControlled: true);

        // Act & Assert
        await Should.ThrowAsync<DispensingSafetyException>(async () =>
            await _sut.RecordDispenseAsync(
                prescriptionId,
                [new DispenseCheckLine(medicineId, 20m), new DispenseCheckLine(medicineId, 20m)],
                cancellationToken: CancellationToken.None));

        var item = (await _db.Prescriptions.Include(p => p.Items).FirstAsync(p => p.Id == prescriptionId)).FindItem(medicineId)!;
        item.DispensedQuantity.ShouldBe(0m);
        item.RefillsUsed.ShouldBe(0);
    }

    #endregion

    public void Dispose() => _db.Dispose();

    #region Per-sale dispense and its reversal

    private async Task<(Guid PrescriptionId, Guid MedicineId, Guid SaleId)> DispenseOnSaleAsync(decimal quantity)
    {
        var medicineId = Guid.CreateVersion7();
        var prescriptionId = await SeedPrescriptionAsync(Guid.CreateVersion7(), medicineId, Today.AddDays(-7), Today.AddDays(30));
        SetControlled(medicineId, isControlled: true);
        var saleId = Guid.CreateVersion7();
        await _sut.RecordDispenseAsync(prescriptionId, [new DispenseCheckLine(medicineId, quantity)], saleId);
        return (prescriptionId, medicineId, saleId);
    }

    private PrescriptionItem Item(Guid prescriptionId) =>
        _db.Prescriptions.Include(p => p.Items).Single(p => p.Id == prescriptionId).Items.Single();

    [Fact]
    public async Task RecordDispenseAsync_Should_Record_A_Sale_Once_When_The_Event_Is_Redelivered()
    {
        var (prescriptionId, medicineId, saleId) = await DispenseOnSaleAsync(10m);

        await _sut.RecordDispenseAsync(prescriptionId, [new DispenseCheckLine(medicineId, 10m)], saleId);

        Item(prescriptionId).DispensedQuantity.ShouldBe(10m);
        Item(prescriptionId).RefillsUsed.ShouldBe(1);
    }

    [Fact]
    public async Task A_Cancelled_Sale_Should_Give_Back_Its_Quantity_And_Refill()
    {
        var (prescriptionId, _, saleId) = await DispenseOnSaleAsync(10m);

        await PrescriptionDispenseReversal.ReverseAsync(
            _db, saleId, PrescriptionDispenseEntry.SaleCancelReference, saleId, returned: null, CancellationToken.None);
        await PrescriptionDispenseReversal.ReverseAsync(
            _db, saleId, PrescriptionDispenseEntry.SaleCancelReference, saleId, returned: null, CancellationToken.None);

        Item(prescriptionId).DispensedQuantity.ShouldBe(0m);
        Item(prescriptionId).RefillsUsed.ShouldBe(0);
    }

    [Fact]
    public async Task A_Partial_Return_Should_Give_Back_Only_That_Quantity_And_Keep_The_Refill_Used()
    {
        var (prescriptionId, medicineId, saleId) = await DispenseOnSaleAsync(10m);
        var firstReturn = Guid.CreateVersion7();

        await PrescriptionDispenseReversal.ReverseAsync(
            _db, saleId, PrescriptionDispenseEntry.ReturnReference, firstReturn, [(medicineId, 4m)], CancellationToken.None);

        Item(prescriptionId).DispensedQuantity.ShouldBe(6m);
        Item(prescriptionId).RefillsUsed.ShouldBe(1);

        // The rest comes back on a second return: now the refill is free again. Asking for more than the sale
        // still holds gives back only what it holds.
        await PrescriptionDispenseReversal.ReverseAsync(
            _db, saleId, PrescriptionDispenseEntry.ReturnReference, Guid.CreateVersion7(), [(medicineId, 9m)], CancellationToken.None);

        Item(prescriptionId).DispensedQuantity.ShouldBe(0m);
        Item(prescriptionId).RefillsUsed.ShouldBe(0);
    }

    #endregion

    private void SetControlled(Guid medicineId, bool isControlled) =>
        SetControlledStatus(new Dictionary<Guid, bool> { [medicineId] = isControlled });

    private void SetControlledStatus(IReadOnlyDictionary<Guid, bool> status)
    {
        // A controlled medicine is gated by the prescription check; uncontrolled lines are not
        // prescription-only in these fixtures, so PrescriptionRequired stays false.
        var flags = status.ToDictionary(
            kvp => kvp.Key,
            kvp => new MedicineDispensingFlags(IsControlled: kvp.Value, PrescriptionRequired: false));

        // NSubstitute's Returns() is the consumer of the ValueTask configured here; CA2012 does not
        // understand that the configuration call is the intended single use.
#pragma warning disable CA2012
        _controlledMedicineChecker
            .GetDispensingFlagsAsync(Arg.Any<IReadOnlyList<Guid>>(), Arg.Any<CancellationToken>())
            .Returns(new ValueTask<IReadOnlyDictionary<Guid, MedicineDispensingFlags>>(flags));
#pragma warning restore CA2012
    }

    private async Task<Guid> SeedPrescriptionWithItemsAsync(
        Guid customerId, params (Guid MedicineId, decimal PrescribedQuantity)[] items)
    {
        var prescription = Prescription.Create(customerId, "Dr. Test", Today.AddDays(-7), Today.AddDays(30));
        foreach (var (medicineId, quantity) in items)
        {
            prescription.AddItem(medicineId, quantity, refillsAllowed: 0);
        }

        _db.Prescriptions.Add(prescription);
        await _db.SaveChangesAsync();
        return prescription.Id;
    }

    private async Task<Guid> SeedPrescriptionAsync(
        Guid customerId, Guid medicineId, DateOnly prescriptionDate, DateOnly expiryDate)
    {
        var prescription = Prescription.Create(customerId, "Dr. Test", prescriptionDate, expiryDate);
        prescription.AddItem(medicineId, prescribedQuantity: 30m, refillsAllowed: 0);
        _db.Prescriptions.Add(prescription);
        await _db.SaveChangesAsync();
        return prescription.Id;
    }
}
