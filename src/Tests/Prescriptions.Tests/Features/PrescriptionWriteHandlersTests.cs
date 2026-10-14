using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Persistence;
using FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;
using FSH.Modules.Prescriptions.Data;
using FSH.Modules.Prescriptions.Domain;
using FSH.Modules.Prescriptions.Features.v1.Prescriptions.CancelPrescription;
using FSH.Modules.Prescriptions.Features.v1.Prescriptions.UpdatePrescription;
using FSH.Modules.Prescriptions.Services;
using FSH.Modules.Inventory.Contracts.Services;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Prescriptions.Tests.Features;

/// <summary>Update/cancel run through the locked write path; the Nepal calendar day drives expiry.</summary>
public sealed class PrescriptionWriteHandlersTests : IDisposable
{
    private static readonly DateOnly Today = new(2026, 6, 15);
    private readonly PrescriptionsDbContext _db = PrescriptionsDbContextFactory.Create();
    private readonly IControlledMedicineChecker _checker = Substitute.For<IControlledMedicineChecker>();

    public PrescriptionWriteHandlersTests() => SetControlled(isControlled: false);

    private UpdatePrescriptionCommandHandler NewUpdateHandler() =>
        new(_db, new AmbientDbTransactionRegistry(), _checker);

    private void SetControlled(bool isControlled)
    {
#pragma warning disable CA2012 // NSubstitute's Returns() consumes the configured ValueTask.
        _checker.GetDispensingFlagsAsync(Arg.Any<IReadOnlyList<Guid>>(), Arg.Any<CancellationToken>())
            .Returns(ci => new ValueTask<IReadOnlyDictionary<Guid, MedicineDispensingFlags>>(
                ci.Arg<IReadOnlyList<Guid>>().ToDictionary(id => id, _ => new MedicineDispensingFlags(isControlled, true))));
#pragma warning restore CA2012
    }

    private async Task<Prescription> SeedAsync(decimal dispensed = 0m)
    {
        var medicineId = Guid.CreateVersion7();
        var prescription = Prescription.Create(Guid.CreateVersion7(), "Dr. Test", Today, Today.AddDays(30));
        prescription.AddItem(medicineId, prescribedQuantity: 30m, refillsAllowed: 0);
        if (dispensed > 0)
        {
            prescription.RecordSaleDispense(medicineId, dispensed, Guid.CreateVersion7(), DateTime.UtcNow, null);
        }

        _db.Prescriptions.Add(prescription);
        await _db.SaveChangesAsync();
        return prescription;
    }

    #region Expiry edits (validity can't be pushed out once dispensed)

    [Fact]
    public async Task Update_Should_Refuse_Extending_The_Expiry_Once_Dispensed()
    {
        var prescription = await SeedAsync(dispensed: 10m);

        var ex = await Should.ThrowAsync<CustomException>(() => NewUpdateHandler()
            .Handle(new UpdatePrescriptionCommand(prescription.Id, ExpiryDate: Today.AddYears(2)), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        _db.ChangeTracker.Clear();
        (await _db.Prescriptions.SingleAsync()).ExpiryDate.ShouldBe(Today.AddDays(30));
    }

    [Fact]
    public async Task Update_Should_Allow_Shortening_The_Expiry_Once_Dispensed()
    {
        var prescription = await SeedAsync(dispensed: 10m);

        await NewUpdateHandler()
            .Handle(new UpdatePrescriptionCommand(prescription.Id, ExpiryDate: Today.AddDays(5)), CancellationToken.None);

        _db.ChangeTracker.Clear();
        (await _db.Prescriptions.SingleAsync()).ExpiryDate.ShouldBe(Today.AddDays(5));
    }

    [Fact]
    public async Task Update_Should_Cap_A_New_Expiry_At_The_Validity_Limit()
    {
        var prescription = await SeedAsync();

        // Undispensed, prescription-only: up to a year is fine, beyond is refused.
        await NewUpdateHandler()
            .Handle(new UpdatePrescriptionCommand(prescription.Id, ExpiryDate: Today.AddMonths(12)), CancellationToken.None);
        await Should.ThrowAsync<CustomException>(() => NewUpdateHandler()
            .Handle(new UpdatePrescriptionCommand(prescription.Id, ExpiryDate: Today.AddMonths(12).AddDays(1)), CancellationToken.None).AsTask());

        // With a controlled medicine the limit is six months.
        SetControlled(isControlled: true);
        var controlled = await SeedAsync();
        var ex = await Should.ThrowAsync<CustomException>(() => NewUpdateHandler()
            .Handle(new UpdatePrescriptionCommand(controlled.Id, ExpiryDate: Today.AddMonths(7)), CancellationToken.None).AsTask());
        ex.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    #endregion

    [Fact]
    public async Task Update_Should_Persist_Header_Changes()
    {
        var prescription = await SeedAsync();

        await NewUpdateHandler()
            .Handle(new UpdatePrescriptionCommand(prescription.Id, DoctorName: "Dr. Koirala"), CancellationToken.None);

        _db.ChangeTracker.Clear();
        (await _db.Prescriptions.SingleAsync()).DoctorName.ShouldBe("Dr. Koirala");
    }

    [Fact]
    public async Task Cancel_Should_Persist_And_A_Second_Cancel_Should_Conflict()
    {
        var prescription = await SeedAsync();
        var sut = new CancelPrescriptionCommandHandler(_db, new AmbientDbTransactionRegistry());

        await sut.Handle(new CancelPrescriptionCommand(prescription.Id, "Doctor withdrew it"), CancellationToken.None);
        var again = await Should.ThrowAsync<CustomException>(() =>
            sut.Handle(new CancelPrescriptionCommand(prescription.Id, "again"), CancellationToken.None).AsTask());

        again.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        _db.ChangeTracker.Clear();
        (await _db.Prescriptions.SingleAsync()).Status.ShouldBe(PrescriptionStatus.Cancelled);
    }

    [Fact]
    public async Task Update_And_Cancel_Of_An_Unknown_Prescription_Should_Be_404()
    {
        await Should.ThrowAsync<NotFoundException>(() => NewUpdateHandler()
            .Handle(new UpdatePrescriptionCommand(Guid.CreateVersion7(), DoctorName: "X"), CancellationToken.None).AsTask());
        await Should.ThrowAsync<NotFoundException>(() => new CancelPrescriptionCommandHandler(_db, new AmbientDbTransactionRegistry())
            .Handle(new CancelPrescriptionCommand(Guid.CreateVersion7(), "x"), CancellationToken.None).AsTask());
    }

    [Fact]
    public void Concurrency_Conflict_Should_Map_To_409()
    {
        var ex = PrescriptionWrites.Conflict(Guid.CreateVersion7(), new DbUpdateConcurrencyException("lost"));

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        ex.InnerException.ShouldBeOfType<DbUpdateConcurrencyException>();
    }

    [Theory]
    [InlineData("2026-06-15T18:14:59Z", "2026-06-15")]
    [InlineData("2026-06-15T18:15:00Z", "2026-06-16")]
    [InlineData("2026-06-15T23:59:00Z", "2026-06-16")]
    public void NepalClock_Should_Roll_The_Day_At_1815_Utc(string utc, string expected)
    {
        NepalClock.DateOf(DateTime.Parse(utc, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.AdjustToUniversal))
            .ShouldBe(DateOnly.Parse(expected, System.Globalization.CultureInfo.InvariantCulture));
    }

    public void Dispose() => _db.Dispose();
}
