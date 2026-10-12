using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Persistence;
using FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;
using FSH.Modules.Prescriptions.Data;
using FSH.Modules.Prescriptions.Domain;
using FSH.Modules.Prescriptions.Features.v1.Prescriptions.CancelPrescription;
using FSH.Modules.Prescriptions.Features.v1.Prescriptions.UpdatePrescription;
using FSH.Modules.Prescriptions.Services;
using Microsoft.EntityFrameworkCore;

namespace Prescriptions.Tests.Features;

/// <summary>Update/cancel run through the locked write path; the Nepal calendar day drives expiry.</summary>
public sealed class PrescriptionWriteHandlersTests : IDisposable
{
    private static readonly DateOnly Today = new(2026, 6, 15);
    private readonly PrescriptionsDbContext _db = PrescriptionsDbContextFactory.Create();

    private async Task<Prescription> SeedAsync()
    {
        var prescription = Prescription.Create(Guid.CreateVersion7(), "Dr. Test", Today, Today.AddDays(30));
        prescription.AddItem(Guid.CreateVersion7(), prescribedQuantity: 30m, refillsAllowed: 0);
        _db.Prescriptions.Add(prescription);
        await _db.SaveChangesAsync();
        return prescription;
    }

    [Fact]
    public async Task Update_Should_Persist_Header_Changes()
    {
        var prescription = await SeedAsync();

        await new UpdatePrescriptionCommandHandler(_db, new AmbientDbTransactionRegistry())
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
        await Should.ThrowAsync<NotFoundException>(() => new UpdatePrescriptionCommandHandler(_db, new AmbientDbTransactionRegistry())
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
