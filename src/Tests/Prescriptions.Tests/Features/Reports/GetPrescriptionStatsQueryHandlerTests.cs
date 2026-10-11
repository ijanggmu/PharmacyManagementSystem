using FSH.Modules.Prescriptions.Contracts.v1.Reports;
using FSH.Modules.Prescriptions.Data;
using FSH.Modules.Prescriptions.Domain;
using FSH.Modules.Prescriptions.Features.v1.Reports.GetPrescriptionStats;
using Prescriptions.Tests.Features;

namespace Prescriptions.Tests.Features.Reports;

public sealed class GetPrescriptionStatsQueryHandlerTests : IDisposable
{
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.UtcNow);

    private readonly PrescriptionsDbContext _db = PrescriptionsDbContextFactory.Create();
    private readonly GetPrescriptionStatsQueryHandler _sut;

    public GetPrescriptionStatsQueryHandlerTests()
    {
        _sut = new GetPrescriptionStatsQueryHandler(_db);
    }

    #region Happy Path

    [Fact]
    public async Task Handle_Should_ReturnZeroedStats_When_NoPrescriptions()
    {
        // Act
        var stats = await _sut.Handle(new GetPrescriptionStatsQuery(), CancellationToken.None);

        // Assert
        stats.Total.ShouldBe(0);
        stats.Pending.ShouldBe(0);
        stats.PartiallyFilled.ShouldBe(0);
        stats.Filled.ShouldBe(0);
        stats.Cancelled.ShouldBe(0);
    }

    [Fact]
    public async Task Handle_Should_CountByDerivedFillStatus_When_MixedPrescriptions()
    {
        // Arrange — one of each derived bucket: pending (no items, and no dispensing), partially
        // filled (one item dispensed less than prescribed), filled (all items fully dispensed), and
        // an explicitly cancelled prescription (counted as Cancelled regardless of dispensing).
        var pendingNoItems = SeedPrescription();

        var pendingUndispensed = SeedPrescription();
        pendingUndispensed.AddItem(Guid.CreateVersion7(), 30m, refillsAllowed: 0);

        var partiallyFilled = SeedPrescription();
        partiallyFilled.AddItem(Guid.CreateVersion7(), 30m, refillsAllowed: 0);
        partiallyFilled.Items[0].RecordDispense(10m);

        var filled = SeedPrescription();
        filled.AddItem(Guid.CreateVersion7(), 30m, refillsAllowed: 0);
        filled.Items[0].RecordDispense(30m);

        var cancelled = SeedPrescription();
        cancelled.AddItem(Guid.CreateVersion7(), 30m, refillsAllowed: 0);
        cancelled.Cancel("no longer needed");

        _db.Prescriptions.AddRange(pendingNoItems, pendingUndispensed, partiallyFilled, filled, cancelled);
        await _db.SaveChangesAsync(CancellationToken.None);

        // Act
        var stats = await _sut.Handle(new GetPrescriptionStatsQuery(), CancellationToken.None);

        // Assert
        stats.Total.ShouldBe(5);
        stats.Pending.ShouldBe(2);
        stats.PartiallyFilled.ShouldBe(1);
        stats.Filled.ShouldBe(1);
        stats.Cancelled.ShouldBe(1);
    }

    #endregion

    private static Prescription SeedPrescription() =>
        Prescription.Create(Guid.CreateVersion7(), "Dr. Smith", Today, Today.AddDays(30));

    public void Dispose() => _db.Dispose();
}
