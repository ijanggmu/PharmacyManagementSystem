using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Persistence;
using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Prescriptions.Contracts.v1.Refills;
using FSH.Modules.Prescriptions.Data;
using FSH.Modules.Prescriptions.Domain;
using FSH.Modules.Prescriptions.Features.v1.Refills.CreatePrescriptionRefill;
using FSH.Modules.Prescriptions.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using NSubstitute.ExceptionExtensions;

namespace Prescriptions.Tests.Features;

/// <summary>The direct (record-only) refill: refuses controlled medicines, and treats the prescribed quantity as per fill.</summary>
public sealed class CreatePrescriptionRefillCommandHandlerTests : IDisposable
{
    private static readonly DateTimeOffset Now = new(2026, 6, 15, 6, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly Today = new(2026, 6, 15);

    private readonly PrescriptionsDbContext _db = PrescriptionsDbContextFactory.Create();
    private readonly IControlledMedicineChecker _checker = Substitute.For<IControlledMedicineChecker>();
    private readonly CreatePrescriptionRefillCommandHandler _sut;

    public CreatePrescriptionRefillCommandHandlerTests()
    {
        var timeProvider = Substitute.For<TimeProvider>();
        timeProvider.GetUtcNow().Returns(Now);

        var mediator = Substitute.For<IMediator>();
#pragma warning disable CA2012 // NSubstitute's Returns() consumes the configured ValueTask.
        mediator.Send(Arg.Any<LookupCustomersQuery>(), Arg.Any<CancellationToken>())
            .Returns(new ValueTask<IReadOnlyList<CustomerLookupDto>>([]));
        mediator.Send(Arg.Any<GetMedicineByIdQuery>(), Arg.Any<CancellationToken>())
            .Throws(new NotFoundException("gone"));
#pragma warning restore CA2012

        _sut = new CreatePrescriptionRefillCommandHandler(
            _db, Substitute.For<ICurrentUser>(), timeProvider, new PrescriptionNameResolver(mediator),
            new AmbientDbTransactionRegistry(), _checker);
    }

    private void SetFlags(Guid medicineId, bool isControlled, bool prescriptionRequired = true)
    {
#pragma warning disable CA2012
        _checker.GetDispensingFlagsAsync(Arg.Any<IReadOnlyList<Guid>>(), Arg.Any<CancellationToken>())
            .Returns(new ValueTask<IReadOnlyDictionary<Guid, MedicineDispensingFlags>>(
                new Dictionary<Guid, MedicineDispensingFlags> { [medicineId] = new(isControlled, prescriptionRequired) }));
#pragma warning restore CA2012
    }

    private async Task<Prescription> SeedAsync(Guid medicineId, decimal prescribed, int refillsAllowed)
    {
        var prescription = Prescription.Create(Guid.CreateVersion7(), "Dr. Test", Today.AddDays(-3), Today.AddDays(30));
        prescription.AddItem(medicineId, prescribed, refillsAllowed);
        _db.Prescriptions.Add(prescription);
        await _db.SaveChangesAsync();
        return prescription;
    }

    private ValueTask<FSH.Modules.Prescriptions.Contracts.Dtos.PrescriptionRefillDto> Refill(Guid prescriptionId, Guid medicineId, decimal quantity) =>
        _sut.Handle(new CreatePrescriptionRefillCommand(prescriptionId, medicineId, quantity), CancellationToken.None);

    #region Controlled medicines

    [Fact]
    public async Task Handle_Should_Refuse_A_Controlled_Medicine_With_409_And_Record_Nothing()
    {
        var morphine = Guid.CreateVersion7();
        var prescription = await SeedAsync(morphine, prescribed: 100m, refillsAllowed: 0);
        SetFlags(morphine, isControlled: true);

        var ex = await Should.ThrowAsync<CustomException>(async () => await Refill(prescription.Id, morphine, 100m));

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        ex.Message.ShouldContain("through a sale");
        _db.ChangeTracker.Clear();
        (await _db.PrescriptionItems.SingleAsync()).DispensedQuantity.ShouldBe(0m);
        (await _db.PrescriptionRefills.CountAsync()).ShouldBe(0);
    }

    #endregion

    #region Prescription-only (record-only) refills

    [Fact]
    public async Task Handle_Should_Allow_The_Refill_After_A_Full_First_Fill()
    {
        // AMOX 21 with 1 refill: fill 21, refill 21 — both recorded; a third is refused.
        var amox = Guid.CreateVersion7();
        var prescription = await SeedAsync(amox, prescribed: 21m, refillsAllowed: 1);
        SetFlags(amox, isControlled: false);

        await Refill(prescription.Id, amox, 21m);
        var second = await Refill(prescription.Id, amox, 21m);
        second.QuantityDispensed.ShouldBe(21m);

        var third = await Should.ThrowAsync<CustomException>(async () => await Refill(prescription.Id, amox, 1m));
        third.StatusCode.ShouldBe(HttpStatusCode.Conflict);

        _db.ChangeTracker.Clear();
        var item = await _db.PrescriptionItems.SingleAsync();
        item.DispensedQuantity.ShouldBe(42m);
        item.RefillsUsed.ShouldBe(2);
        (await _db.PrescriptionRefills.CountAsync()).ShouldBe(2);
    }

    [Fact]
    public async Task Handle_Should_Allow_The_Balance_Of_A_Partial_Fill()
    {
        var medicine = Guid.CreateVersion7();
        var prescription = await SeedAsync(medicine, prescribed: 10m, refillsAllowed: 0);
        SetFlags(medicine, isControlled: false);

        await Refill(prescription.Id, medicine, 6m);
        await Refill(prescription.Id, medicine, 4m);

        _db.ChangeTracker.Clear();
        var item = await _db.PrescriptionItems.SingleAsync();
        item.DispensedQuantity.ShouldBe(10m);
        item.RefillsUsed.ShouldBe(1);
    }

    #endregion

    public void Dispose() => _db.Dispose();
}
