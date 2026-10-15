using FSH.Framework.Core.Context;
using FSH.Framework.Persistence;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Prescriptions.Contracts.Services;
using FSH.Modules.Prescriptions.Data;
using FSH.Modules.Prescriptions.Domain;
using FSH.Modules.Prescriptions.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
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
        _sut = new DispensingSafetyPolicy(
            _db, _controlledMedicineChecker, _timeProvider, new AmbientDbTransactionRegistry(), Substitute.For<ICurrentUser>(),
            NullLogger<DispensingSafetyPolicy>.Instance);
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

    [Fact]
    public async Task EnsureDispensableAsync_Should_Use_The_Nepal_Date_For_Expiry()
    {
        // 19:00 UTC on the 15th is 00:45 on the 16th in Nepal: a prescription that expired on the 15th
        // must not be dispensable for the rest of the UTC day.
        var customerId = Guid.CreateVersion7();
        var medicineId = Guid.CreateVersion7();
        var prescriptionId = await SeedPrescriptionAsync(
            customerId, medicineId, prescriptionDate: Today.AddDays(-60), expiryDate: Today);
        SetControlled(medicineId, isControlled: true);
        _timeProvider.GetUtcNow().Returns(new DateTimeOffset(2026, 6, 15, 19, 0, 0, TimeSpan.Zero));

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
            CancellationToken.None);

        // Assert
        var prescription = await _db.Prescriptions.Include(p => p.Items).FirstAsync(p => p.Id == prescriptionId);
        var controlledItem = prescription.FindItem(controlledId)!;
        var uncontrolledItem = prescription.FindItem(uncontrolledId)!;
        controlledItem.DispensedQuantity.ShouldBe(10m);
        controlledItem.RefillsUsed.ShouldBe(0); // 10 of a 30 fill: the fill is not used up yet
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
            CancellationToken.None);

        // Assert: the accumulated quantity is recorded; 20 of a 30 fill doesn't complete the fill.
        var item = (await _db.Prescriptions.Include(p => p.Items).FirstAsync(p => p.Id == prescriptionId)).FindItem(medicineId)!;
        item.DispensedQuantity.ShouldBe(20m);
        item.RefillsUsed.ShouldBe(0);
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
                prescriptionId, [new DispenseCheckLine(unlistedId, 10m)], CancellationToken.None));
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
                CancellationToken.None));

        var item = (await _db.Prescriptions.Include(p => p.Items).FirstAsync(p => p.Id == prescriptionId)).FindItem(medicineId)!;
        item.DispensedQuantity.ShouldBe(0m);
        item.RefillsUsed.ShouldBe(0);
    }

    #endregion

    #region Sale consumption (in the sale's transaction) and reconciliation

    [Fact]
    public async Task ConsumeForSaleAsync_Should_RecordQuantityFillAndSaleStampedRefill()
    {
        var customerId = Guid.CreateVersion7();
        var medicineId = Guid.CreateVersion7();
        var prescriptionId = await SeedPrescriptionWithItemsAsync(customerId, (medicineId, 30m));
        SetControlled(medicineId, isControlled: true);
        var saleId = Guid.CreateVersion7();

        await _sut.ConsumeForSaleAsync(saleId, prescriptionId, customerId, [new DispenseCheckLine(medicineId, 10m)]);

        var item = await _db.PrescriptionItems.AsNoTracking().SingleAsync(i => i.PrescriptionId == prescriptionId);
        item.DispensedQuantity.ShouldBe(10m);
        item.RefillsUsed.ShouldBe(0);
        var refill = await _db.PrescriptionRefills.AsNoTracking().SingleAsync();
        refill.SaleId.ShouldBe(saleId);
        refill.QuantityDispensed.ShouldBe(10m);
    }

    [Fact]
    public async Task ConsumeForSaleAsync_Should_BeIdempotent_PerSale()
    {
        var customerId = Guid.CreateVersion7();
        var medicineId = Guid.CreateVersion7();
        var prescriptionId = await SeedPrescriptionWithItemsAsync(customerId, (medicineId, 30m));
        SetControlled(medicineId, isControlled: true);
        var saleId = Guid.CreateVersion7();

        await _sut.ConsumeForSaleAsync(saleId, prescriptionId, customerId, [new DispenseCheckLine(medicineId, 10m)]);
        await _sut.ConsumeForSaleAsync(saleId, prescriptionId, customerId, [new DispenseCheckLine(medicineId, 10m)]);

        var item = await _db.PrescriptionItems.AsNoTracking().SingleAsync(i => i.PrescriptionId == prescriptionId);
        item.DispensedQuantity.ShouldBe(10m);
        (await _db.PrescriptionRefills.CountAsync()).ShouldBe(1);
    }

    [Fact]
    public async Task ConsumeForSaleAsync_Should_RefuseASecondSale_When_TheFirstUsedTheOnlyFill()
    {
        // Both sales passed the unlocked pre-check; the second consumption sees the first one's record.
        var customerId = Guid.CreateVersion7();
        var medicineId = Guid.CreateVersion7();
        var prescriptionId = await SeedPrescriptionWithItemsAsync(customerId, (medicineId, 30m));
        SetControlled(medicineId, isControlled: true);
        await _sut.EnsureDispensableAsync([new DispenseCheckLine(medicineId, 30m)], prescriptionId, customerId);
        await _sut.EnsureDispensableAsync([new DispenseCheckLine(medicineId, 10m)], prescriptionId, customerId);

        await _sut.ConsumeForSaleAsync(Guid.CreateVersion7(), prescriptionId, customerId, [new DispenseCheckLine(medicineId, 30m)]);
        await Should.ThrowAsync<DispensingSafetyException>(async () =>
            await _sut.ConsumeForSaleAsync(Guid.CreateVersion7(), prescriptionId, customerId, [new DispenseCheckLine(medicineId, 10m)]));

        var item = await _db.PrescriptionItems.AsNoTracking().SingleAsync(i => i.PrescriptionId == prescriptionId);
        item.DispensedQuantity.ShouldBe(30m);
        item.RefillsUsed.ShouldBe(1);
    }

    [Fact]
    public async Task ConsumeForSaleAsync_Should_Refuse_When_PrescriptionBelongsToAnotherCustomer()
    {
        var medicineId = Guid.CreateVersion7();
        var prescriptionId = await SeedPrescriptionWithItemsAsync(Guid.CreateVersion7(), (medicineId, 30m));
        SetControlled(medicineId, isControlled: true);

        await Should.ThrowAsync<DispensingSafetyException>(async () =>
            await _sut.ConsumeForSaleAsync(Guid.CreateVersion7(), prescriptionId, Guid.CreateVersion7(), [new DispenseCheckLine(medicineId, 5m)]));
    }

    [Fact]
    public async Task ReconcileSaleDispenseAsync_Should_DoNothing_When_TheSaleAlreadyConsumed()
    {
        var customerId = Guid.CreateVersion7();
        var medicineId = Guid.CreateVersion7();
        var prescriptionId = await SeedPrescriptionWithItemsAsync(customerId, (medicineId, 30m));
        SetControlled(medicineId, isControlled: true);
        var saleId = Guid.CreateVersion7();
        await _sut.ConsumeForSaleAsync(saleId, prescriptionId, customerId, [new DispenseCheckLine(medicineId, 10m)]);

        await _sut.ReconcileSaleDispenseAsync(saleId, prescriptionId, [new DispenseCheckLine(medicineId, 10m)]);

        var item = await _db.PrescriptionItems.AsNoTracking().SingleAsync(i => i.PrescriptionId == prescriptionId);
        item.DispensedQuantity.ShouldBe(10m);
        item.RefillsUsed.ShouldBe(0);
    }

    [Fact]
    public async Task ReconcileSaleDispenseAsync_Should_RecordAnUnconsumedSale_And_NotThrow_When_ItNoLongerFits()
    {
        var customerId = Guid.CreateVersion7();
        var medicineId = Guid.CreateVersion7();
        var prescriptionId = await SeedPrescriptionWithItemsAsync(customerId, (medicineId, 30m));
        SetControlled(medicineId, isControlled: true);

        await _sut.ReconcileSaleDispenseAsync(Guid.CreateVersion7(), prescriptionId, [new DispenseCheckLine(medicineId, 30m)]);
        // No fills left (refillsAllowed: 0, the fill dispensed in full): logged, not thrown, nothing recorded.
        await Should.NotThrowAsync(async () =>
            await _sut.ReconcileSaleDispenseAsync(Guid.CreateVersion7(), prescriptionId, [new DispenseCheckLine(medicineId, 10m)]));

        var item = await _db.PrescriptionItems.AsNoTracking().SingleAsync(i => i.PrescriptionId == prescriptionId);
        item.DispensedQuantity.ShouldBe(30m);
        item.RefillsUsed.ShouldBe(1);
    }

    [Fact]
    public async Task ConsumeForSaleAsync_Should_Allow_The_Balance_Of_A_Partial_Fill_In_A_Later_Sale()
    {
        // MORPH 10, no refills: a sale of 6, then a sale of the remaining 4, then nothing more.
        var customerId = Guid.CreateVersion7();
        var medicineId = Guid.CreateVersion7();
        var prescriptionId = await SeedPrescriptionWithItemsAsync(customerId, (medicineId, 10m));
        SetControlled(medicineId, isControlled: true);

        await _sut.ConsumeForSaleAsync(Guid.CreateVersion7(), prescriptionId, customerId, [new DispenseCheckLine(medicineId, 6m)]);
        await _sut.EnsureDispensableAsync([new DispenseCheckLine(medicineId, 4m)], prescriptionId, customerId);
        await _sut.ConsumeForSaleAsync(Guid.CreateVersion7(), prescriptionId, customerId, [new DispenseCheckLine(medicineId, 4m)]);
        await Should.ThrowAsync<DispensingSafetyException>(async () =>
            await _sut.ConsumeForSaleAsync(Guid.CreateVersion7(), prescriptionId, customerId, [new DispenseCheckLine(medicineId, 1m)]));

        var item = await _db.PrescriptionItems.AsNoTracking().SingleAsync(i => i.PrescriptionId == prescriptionId);
        item.DispensedQuantity.ShouldBe(10m);
        item.RefillsUsed.ShouldBe(1);
        (await _db.PrescriptionRefills.CountAsync()).ShouldBe(2);
    }

    [Fact]
    public async Task ConsumeForSaleAsync_Should_Treat_The_Prescribed_Quantity_As_Per_Fill()
    {
        // AMOX 21 with 1 refill: the first fill and the refill each dispense 21; a third sale is refused.
        var customerId = Guid.CreateVersion7();
        var medicineId = Guid.CreateVersion7();
        var prescription = Prescription.Create(customerId, "Dr. Test", Today.AddDays(-7), Today.AddDays(30));
        prescription.AddItem(medicineId, 21m, refillsAllowed: 1);
        _db.Prescriptions.Add(prescription);
        await _db.SaveChangesAsync();
        SetControlled(medicineId, isControlled: true);

        await _sut.ConsumeForSaleAsync(Guid.CreateVersion7(), prescription.Id, customerId, [new DispenseCheckLine(medicineId, 21m)]);
        await _sut.EnsureDispensableAsync([new DispenseCheckLine(medicineId, 21m)], prescription.Id, customerId);
        await _sut.ConsumeForSaleAsync(Guid.CreateVersion7(), prescription.Id, customerId, [new DispenseCheckLine(medicineId, 21m)]);
        await Should.ThrowAsync<DispensingSafetyException>(async () =>
            await _sut.EnsureDispensableAsync([new DispenseCheckLine(medicineId, 1m)], prescription.Id, customerId));

        var item = await _db.PrescriptionItems.AsNoTracking().SingleAsync(i => i.PrescriptionId == prescription.Id);
        item.DispensedQuantity.ShouldBe(42m);
        item.RefillsUsed.ShouldBe(2);
    }

    [Fact]
    public async Task EnsureDispensableAsync_Should_Refuse_More_Than_One_Fill_In_One_Sale()
    {
        var customerId = Guid.CreateVersion7();
        var medicineId = Guid.CreateVersion7();
        var prescription = Prescription.Create(customerId, "Dr. Test", Today.AddDays(-7), Today.AddDays(30));
        prescription.AddItem(medicineId, 21m, refillsAllowed: 1);
        _db.Prescriptions.Add(prescription);
        await _db.SaveChangesAsync();
        SetControlled(medicineId, isControlled: true);

        await Should.ThrowAsync<DispensingSafetyException>(async () =>
            await _sut.EnsureDispensableAsync([new DispenseCheckLine(medicineId, 42m)], prescription.Id, customerId));
    }

    #endregion

    public void Dispose() => _db.Dispose();

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
