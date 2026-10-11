using FSH.Framework.Core.Context;
using FSH.Framework.Persistence;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Prescriptions.Contracts.Services;
using FSH.Modules.Prescriptions.Data;
using FSH.Modules.Prescriptions.Domain;
using FSH.Modules.Prescriptions.IntegrationEventHandlers;
using FSH.Modules.Prescriptions.Services;
using FSH.Modules.Sales.Contracts.Events;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Prescriptions.Tests.Features;

namespace Prescriptions.Tests.Services;

/// <summary>Cancelled / returned sales give prescription quantity back, once.</summary>
public sealed class SaleDispenseReversalServiceTests : IDisposable
{
    private static readonly DateTimeOffset Now = new(2026, 6, 15, 12, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly Today = DateOnly.FromDateTime(Now.UtcDateTime);

    private readonly PrescriptionsDbContext _db = PrescriptionsDbContextFactory.Create();
    private readonly TimeProvider _timeProvider = Substitute.For<TimeProvider>();
    private readonly DispensingSafetyPolicy _policy;
    private readonly SaleDispenseReversalService _sut;
    private readonly Guid _customerId = Guid.CreateVersion7();
    private readonly Guid _medicineId = Guid.CreateVersion7();

    public SaleDispenseReversalServiceTests()
    {
        _timeProvider.GetUtcNow().Returns(Now);
        var checker = Substitute.For<IControlledMedicineChecker>();
#pragma warning disable CA2012 // NSubstitute's Returns() consumes the configured ValueTask.
        checker.GetDispensingFlagsAsync(Arg.Any<IReadOnlyList<Guid>>(), Arg.Any<CancellationToken>())
            .Returns(new ValueTask<IReadOnlyDictionary<Guid, MedicineDispensingFlags>>(
                new Dictionary<Guid, MedicineDispensingFlags> { [_medicineId] = new(IsControlled: true, PrescriptionRequired: true) }));
#pragma warning restore CA2012
        var ambient = new AmbientDbTransactionRegistry();
        _policy = new DispensingSafetyPolicy(
            _db, checker, _timeProvider, ambient, Substitute.For<ICurrentUser>(), NullLogger<DispensingSafetyPolicy>.Instance);
        _sut = new SaleDispenseReversalService(_db, ambient, _timeProvider, NullLogger<SaleDispenseReversalService>.Instance);
    }

    [Fact]
    public async Task Cancellation_Should_GiveBackQuantityAndFill_Once()
    {
        var prescriptionId = await SeedAsync(prescribed: 30m, refillsAllowed: 0);
        var saleId = await SellAsync(prescriptionId, 10m);
        var handler = new SaleCancelledIntegrationEventHandler(_sut);
        var cancelled = new SaleCancelledIntegrationEvent(
            Guid.NewGuid(), DateTime.UtcNow, "test-tenant", "c", "Sales", saleId, "customer changed mind",
            [new SaleCancelledLine(_medicineId, 10m, 1m)]);

        await handler.HandleAsync(cancelled);
        await handler.HandleAsync(cancelled); // redelivered

        var item = await ItemAsync(prescriptionId);
        item.DispensedQuantity.ShouldBe(0m);
        item.RefillsUsed.ShouldBe(0);
        var reversal = await _db.PrescriptionDispenseReversals.AsNoTracking().SingleAsync();
        reversal.Source.ShouldBe(DispenseReversalSource.SaleCancelled);
        reversal.Quantity.ShouldBe(10m);
        reversal.FillRestored.ShouldBeTrue();

        // The fill is usable again.
        await Should.NotThrowAsync(async () => await SellAsync(prescriptionId, 10m));
    }

    [Fact]
    public async Task PartialReturn_Should_GiveBackQuantity_And_KeepTheFill_UntilFullyReturned()
    {
        var prescriptionId = await SeedAsync(prescribed: 30m, refillsAllowed: 1);
        var saleId = await SellAsync(prescriptionId, 10m);
        var handler = new ReturnCompletedIntegrationEventHandler(_sut);

        var firstReturn = Return(saleId, 4m);
        await handler.HandleAsync(firstReturn);
        await handler.HandleAsync(firstReturn); // redelivered: no double give-back

        var item = await ItemAsync(prescriptionId);
        item.DispensedQuantity.ShouldBe(6m);
        item.RefillsUsed.ShouldBe(1);

        // Returning more than is left only gives back what the sale dispensed.
        await handler.HandleAsync(Return(saleId, 50m));

        item = await ItemAsync(prescriptionId);
        item.DispensedQuantity.ShouldBe(0m);
        item.RefillsUsed.ShouldBe(0);
        (await _db.PrescriptionDispenseReversals.CountAsync()).ShouldBe(2);
    }

    [Fact]
    public async Task Reversal_Should_DoNothing_ForASaleWithoutPrescriptionDispense()
    {
        int adjusted = await _sut.ReverseAsync(
            Guid.CreateVersion7(), DispenseReversalSource.SaleCancelled, Guid.CreateVersion7(), lines: null);

        adjusted.ShouldBe(0);
        (await _db.PrescriptionDispenseReversals.CountAsync()).ShouldBe(0);
    }

    private ReturnCompletedIntegrationEvent Return(Guid saleId, decimal quantity) =>
        new(Guid.NewGuid(), DateTime.UtcNow, "test-tenant", "c", "Sales", Guid.CreateVersion7(), saleId, Guid.CreateVersion7(),
            quantity, [new ReturnCompletedLine(_medicineId, quantity, 1m)]);

    private async Task<Guid> SellAsync(Guid prescriptionId, decimal quantity)
    {
        var saleId = Guid.CreateVersion7();
        await _policy.ConsumeForSaleAsync(saleId, prescriptionId, _customerId, [new DispenseCheckLine(_medicineId, quantity)]);
        return saleId;
    }

    private Task<PrescriptionItem> ItemAsync(Guid prescriptionId) =>
        _db.PrescriptionItems.AsNoTracking().SingleAsync(i => i.PrescriptionId == prescriptionId);

    private async Task<Guid> SeedAsync(decimal prescribed, int refillsAllowed)
    {
        var prescription = Prescription.Create(_customerId, "Dr. Test", Today.AddDays(-7), Today.AddDays(30));
        prescription.AddItem(_medicineId, prescribed, refillsAllowed);
        _db.Prescriptions.Add(prescription);
        await _db.SaveChangesAsync();
        return prescription.Id;
    }

    public void Dispose() => _db.Dispose();
}
