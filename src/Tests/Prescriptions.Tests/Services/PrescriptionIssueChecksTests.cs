using System.Net;
using FluentValidation.TestHelper;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;
using FSH.Modules.Prescriptions.Features.v1.Prescriptions.CreatePrescription;
using FSH.Modules.Prescriptions.Services;
using Mediator;
using NSubstitute;
using NSubstitute.ExceptionExtensions;

namespace Prescriptions.Tests.Services;

/// <summary>A new prescription must name a real, active customer and real medicines, be currently valid,
/// and stay within the validity/refill limits (tighter for controlled medicines).</summary>
public sealed class PrescriptionIssueChecksTests
{
    // 06:00 UTC = 11:45 in Nepal, same calendar day.
    private static readonly DateTimeOffset Now = new(2026, 6, 15, 6, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly Today = new(2026, 6, 15);

    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly PrescriptionIssueChecks _sut;
    private readonly Guid _customerId = Guid.CreateVersion7();
    private readonly Guid _amoxicillin = Guid.CreateVersion7();
    private readonly Guid _morphine = Guid.CreateVersion7();

    public PrescriptionIssueChecksTests()
    {
        var timeProvider = Substitute.For<TimeProvider>();
        timeProvider.GetUtcNow().Returns(Now);
        _sut = new PrescriptionIssueChecks(_mediator, timeProvider);

        SetCustomer(isActive: true);
        SetMedicine(_amoxicillin, "Amoxicillin 500mg", isControlled: false);
        SetMedicine(_morphine, "Morphine 10mg", isControlled: true);
    }

    private void SetCustomer(bool isActive)
    {
#pragma warning disable CA2012 // NSubstitute's Returns() consumes the configured ValueTask.
        _mediator.Send(Arg.Is<GetCustomerByIdQuery>(q => q.CustomerId == _customerId), Arg.Any<CancellationToken>())
            .Returns(new ValueTask<CustomerDto>(new CustomerDto(
                _customerId, "Ram Thapa", null, null, null, 0m, isActive, DateTime.UtcNow, null)));
#pragma warning restore CA2012
    }

    private void SetMedicine(Guid id, string name, bool isControlled)
    {
#pragma warning disable CA2012
        _mediator.Send(Arg.Is<GetMedicineByIdQuery>(q => q.MedicineId == id), Arg.Any<CancellationToken>())
            .Returns(new ValueTask<MedicineDto>(new MedicineDto(
                id, name, null, null, 0m, isControlled, 0m, false, DateTime.UtcNow, null)));
#pragma warning restore CA2012
    }

    private CreatePrescriptionCommand Command(
        Guid? customerId = null, DateOnly? issued = null, DateOnly? expires = null, params PrescriptionItemInput[] items) =>
        new(customerId ?? _customerId, "Dr. Sharma", issued ?? Today, expires ?? Today.AddMonths(3),
            items.Length > 0 ? items : [new PrescriptionItemInput(_amoxicillin, 21m, 1)]);

    private async Task<CustomException> RejectedAsync(CreatePrescriptionCommand command) =>
        await Should.ThrowAsync<CustomException>(async () => await _sut.EnsureValidAsync(command));

    #region Happy Path

    [Fact]
    public async Task EnsureValidAsync_Should_Accept_A_Current_Prescription_Within_Limits()
    {
        await Should.NotThrowAsync(async () => await _sut.EnsureValidAsync(Command()));
        await Should.NotThrowAsync(async () => await _sut.EnsureValidAsync(
            Command(expires: Today.AddMonths(6), items: new PrescriptionItemInput(_morphine, 10m, 0))));
    }

    #endregion

    #region Exception

    [Fact]
    public async Task EnsureValidAsync_Should_Reject_An_Unknown_Customer()
    {
        var unknown = Guid.CreateVersion7();
#pragma warning disable CA2012 // NSubstitute configuration call, not a consumed ValueTask.
        _mediator.Send(Arg.Is<GetCustomerByIdQuery>(q => q.CustomerId == unknown), Arg.Any<CancellationToken>())
            .Throws(new NotFoundException("Customer not found."));
#pragma warning restore CA2012

        var ex = await RejectedAsync(Command(customerId: unknown));

        ex.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        ex.Message.ShouldContain("not found");
    }

    [Fact]
    public async Task EnsureValidAsync_Should_Reject_An_Inactive_Customer_With_409()
    {
        SetCustomer(isActive: false);

        var ex = await RejectedAsync(Command());

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        ex.Message.ShouldContain("inactive");
    }

    [Fact]
    public async Task EnsureValidAsync_Should_Reject_An_Unknown_Medicine()
    {
        var unknown = Guid.CreateVersion7();
#pragma warning disable CA2012 // NSubstitute configuration call, not a consumed ValueTask.
        _mediator.Send(Arg.Is<GetMedicineByIdQuery>(q => q.MedicineId == unknown), Arg.Any<CancellationToken>())
            .Throws(new NotFoundException("Medicine not found."));
#pragma warning restore CA2012

        var ex = await RejectedAsync(Command(items: new PrescriptionItemInput(unknown, 10m, 0)));

        ex.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        ex.Message.ShouldContain(unknown.ToString());
    }

    [Fact]
    public async Task EnsureValidAsync_Should_Reject_An_Already_Expired_Prescription()
    {
        var ex = await RejectedAsync(Command(issued: new DateOnly(2026, 1, 1), expires: new DateOnly(2026, 2, 1)));

        ex.Message.ShouldContain("expired");
    }

    [Fact]
    public async Task EnsureValidAsync_Should_Reject_A_Future_Issue_Date()
    {
        var ex = await RejectedAsync(Command(issued: new DateOnly(2027, 1, 1), expires: new DateOnly(2027, 2, 1)));

        ex.Message.ShouldContain("future");
    }

    [Fact]
    public async Task EnsureValidAsync_Should_Use_The_Nepal_Date_For_The_Issue_Date()
    {
        // 19:00 UTC on the 15th is already the 16th in Nepal: a prescription dated the 16th is not in the future.
        var timeProvider = Substitute.For<TimeProvider>();
        timeProvider.GetUtcNow().Returns(new DateTimeOffset(2026, 6, 15, 19, 0, 0, TimeSpan.Zero));
        var sut = new PrescriptionIssueChecks(_mediator, timeProvider);

        await Should.NotThrowAsync(async () => await sut.EnsureValidAsync(Command(issued: Today.AddDays(1), expires: Today.AddDays(30))));
    }

    [Fact]
    public async Task EnsureValidAsync_Should_Reject_A_Controlled_Medicine_Valid_Longer_Than_Six_Months_Or_With_Refills()
    {
        // The QA case: a narcotic valid 5 years, 1000 units, 50 refills.
        var ex = await RejectedAsync(Command(expires: Today.AddYears(5), items: new PrescriptionItemInput(_morphine, 1000m, 50)));

        ex.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        ex.ErrorMessages.ShouldContain(m => m.Contains("cannot allow refills", StringComparison.Ordinal));
        ex.ErrorMessages.ShouldContain(m => m.Contains("6 months", StringComparison.Ordinal));
    }

    [Fact]
    public async Task EnsureValidAsync_Should_Reject_Any_Prescription_Valid_Longer_Than_A_Year()
    {
        var ex = await RejectedAsync(Command(expires: Today.AddMonths(12).AddDays(1)));

        ex.Message.ShouldContain("12 months");
    }

    #endregion

    #region Validator (shape rules)

    [Fact]
    public void Validator_Should_Reject_Too_Many_Refills_A_Zero_Quantity_And_A_Validity_Over_A_Year()
    {
        var validator = new CreatePrescriptionCommandValidator();

        validator.TestValidate(Command(items: new PrescriptionItemInput(_amoxicillin, 10m, 13)))
            .ShouldHaveValidationErrorFor("Items[0].RefillsAllowed");
        validator.TestValidate(Command(items: new PrescriptionItemInput(_amoxicillin, 0m, 0)))
            .ShouldHaveValidationErrorFor("Items[0].PrescribedQuantity");
        validator.TestValidate(Command(expires: Today.AddYears(5)))
            .ShouldHaveValidationErrorFor(x => x.ExpiryDate);
        validator.TestValidate(Command(items: new PrescriptionItemInput(_amoxicillin, 10m, 12)))
            .ShouldNotHaveAnyValidationErrors();
    }

    #endregion
}
