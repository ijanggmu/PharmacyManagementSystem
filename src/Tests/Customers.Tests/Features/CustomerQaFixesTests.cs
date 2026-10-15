using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.v1.Cheques;
using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Contracts.v1.Ledger;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.Features.v1.Customers;
using FSH.Modules.Customers.Features.v1.Customers.CreateCustomer;
using FSH.Modules.Customers.Features.v1.Customers.GetCustomerById;
using FSH.Modules.Customers.Features.v1.Customers.UpdateCustomer;
using FSH.Modules.Customers.Features.v1.Ledger.GetArAgingReport;
using FSH.Modules.Customers.Features.v1.Ledger.RecordCustomerPayment;
using FSH.Modules.Customers.IntegrationEventHandlers;
using FSH.Modules.Customers.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Events;
using FluentValidation.TestHelper;
using Mediator;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Customers.Tests.Features;

/// <summary>QA fixes: profile fields that used to be dropped, the active flag on update, duplicate phones,
/// PAN and date-of-birth rules, payment methods, duplicate cheques, advances on the aging, return labels,
/// the cancellation entry type and lookup without money.</summary>
public sealed class CustomerQaFixesTests : IDisposable
{
    private readonly CustomersDbContext _db = CustomersDbContextFactory.Create();
    private readonly ICustomerCreditPermissionGuard _credit = Substitute.For<ICustomerCreditPermissionGuard>();
    private readonly ICustomerCodeService _codes = Substitute.For<ICustomerCodeService>();
    private int _nextCode;

    public CustomerQaFixesTests()
    {
        _codes.NextAsync(Arg.Any<CancellationToken>()).Returns(_ => $"C-{++_nextCode:D6}");
    }

    public void Dispose() => _db.Dispose();

    private CreateCustomerCommandHandler CreateHandler() =>
        new(_db, _codes, _credit, Substitute.For<IOutboxWriter>(), Substitute.For<ICurrentUser>(), Substitute.For<ICurrentBranch>());

    private UpdateCustomerCommandHandler UpdateHandler() => new(_db, _credit);

    private Task<CustomerDto> GetAsync(Guid id) =>
        new GetCustomerByIdQueryHandler(_db).Handle(new GetCustomerByIdQuery(id), CancellationToken.None).AsTask();

    #region Profile fields

    [Fact]
    public async Task Create_Should_Store_Date_Of_Birth_Insurance_And_Pan()
    {
        var dob = new DateOnly(2019, 5, 1);
        var id = await CreateHandler().Handle(
            new CreateCustomerCommand("Asha Gurung", PanNumber: "123 456 789", DateOfBirth: dob,
                InsuranceProvider: " Shikhar ", InsuranceNumber: "POL-1"),
            CancellationToken.None);

        var dto = await GetAsync(id);
        dto.DateOfBirth.ShouldBe(dob);
        dto.InsuranceProvider.ShouldBe("Shikhar");
        dto.InsuranceNumber.ShouldBe("POL-1");
        dto.PanNumber.ShouldBe("123456789");
    }

    [Fact]
    public async Task Update_Should_Keep_Omitted_Profile_Fields_And_Clear_On_Request()
    {
        var id = await CreateHandler().Handle(
            new CreateCustomerCommand("Asha", DateOfBirth: new DateOnly(2019, 5, 1), InsuranceProvider: "Shikhar", PanNumber: "123456789"),
            CancellationToken.None);

        await UpdateHandler().Handle(new UpdateCustomerCommand(id, "Asha"), CancellationToken.None);
        var kept = await GetAsync(id);
        kept.DateOfBirth.ShouldBe(new DateOnly(2019, 5, 1));
        kept.InsuranceProvider.ShouldBe("Shikhar");
        kept.PanNumber.ShouldBe("123456789");

        await UpdateHandler().Handle(
            new UpdateCustomerCommand(id, "Asha", ClearDateOfBirth: true, InsuranceProvider: "", PanNumber: ""),
            CancellationToken.None);
        var cleared = await GetAsync(id);
        cleared.DateOfBirth.ShouldBeNull();
        cleared.InsuranceProvider.ShouldBeNull();
        cleared.PanNumber.ShouldBeNull();
    }

    [Fact]
    public async Task Update_Without_IsActive_Should_Not_Reactivate_An_Inactive_Customer()
    {
        var id = await CreateHandler().Handle(new CreateCustomerCommand("Ram", Phone: "9841000001"), CancellationToken.None);
        await UpdateHandler().Handle(new UpdateCustomerCommand(id, "Ram", Phone: "9841000001", IsActive: false), CancellationToken.None);

        await UpdateHandler().Handle(new UpdateCustomerCommand(id, "Ram Bahadur", Phone: "9841000001"), CancellationToken.None);

        var dto = await GetAsync(id);
        dto.IsActive.ShouldBeFalse();
        dto.Name.ShouldBe("Ram Bahadur");

        await UpdateHandler().Handle(new UpdateCustomerCommand(id, "Ram Bahadur", Phone: "9841000001", IsActive: true), CancellationToken.None);
        (await GetAsync(id)).IsActive.ShouldBeTrue();
    }

    [Fact]
    public void Validators_Should_Refuse_A_Bad_Pan_And_An_Implausible_Date_Of_Birth()
    {
        var create = new CreateCustomerCommandValidator();
        create.TestValidate(new CreateCustomerCommand("A", PanNumber: "12AB")).ShouldHaveValidationErrorFor(x => x.PanNumber);
        create.TestValidate(new CreateCustomerCommand("A", PanNumber: "123456789")).ShouldNotHaveValidationErrorFor(x => x.PanNumber);
        create.TestValidate(new CreateCustomerCommand("A", DateOfBirth: DateOnly.FromDateTime(DateTime.UtcNow).AddDays(5)))
            .ShouldHaveValidationErrorFor(x => x.DateOfBirth);

        var update = new UpdateCustomerCommandValidator();
        update.TestValidate(new UpdateCustomerCommand(Guid.CreateVersion7(), "A", PanNumber: "ABCDEFGHI"))
            .ShouldHaveValidationErrorFor(x => x.PanNumber);
        update.TestValidate(new UpdateCustomerCommand(Guid.CreateVersion7(), "A", PanNumber: ""))
            .ShouldNotHaveValidationErrorFor(x => x.PanNumber);
    }

    [Fact]
    public void Date_Of_Birth_Rule_Should_Accept_Today_And_Refuse_Over_130_Years()
    {
        var today = new DateOnly(2026, 10, 15);
        CustomerProfileRules.IsPlausibleDateOfBirth(today, today).ShouldBeTrue();
        CustomerProfileRules.IsPlausibleDateOfBirth(today.AddDays(1), today).ShouldBeFalse();
        CustomerProfileRules.IsPlausibleDateOfBirth(today.AddYears(-131), today).ShouldBeFalse();
    }

    #endregion

    #region Duplicate phone

    [Fact]
    public async Task Create_Should_Refuse_A_Phone_Another_Active_Customer_Has()
    {
        await CreateHandler().Handle(new CreateCustomerCommand("Ram", Phone: "+977-9841234567"), CancellationToken.None);

        var ex = await Should.ThrowAsync<CustomException>(() =>
            CreateHandler().Handle(new CreateCustomerCommand("Shyam", Phone: "9841 234567"), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await _db.Customers.CountAsync()).ShouldBe(1);
    }

    [Fact]
    public async Task Phone_Of_An_Inactive_Customer_Should_Be_Reusable()
    {
        var old = await CreateHandler().Handle(new CreateCustomerCommand("Ram", Phone: "9841234567"), CancellationToken.None);
        await UpdateHandler().Handle(new UpdateCustomerCommand(old, "Ram", Phone: "9841234567", IsActive: false), CancellationToken.None);

        await Should.NotThrowAsync(() =>
            CreateHandler().Handle(new CreateCustomerCommand("Shyam", Phone: "9841234567"), CancellationToken.None).AsTask());
    }

    [Fact]
    public async Task Update_Should_Refuse_Changing_To_Another_Customers_Phone_But_Allow_Keeping_Its_Own()
    {
        await CreateHandler().Handle(new CreateCustomerCommand("Ram", Phone: "9841234567"), CancellationToken.None);
        var shyam = await CreateHandler().Handle(new CreateCustomerCommand("Shyam", Phone: "9851000000"), CancellationToken.None);

        await Should.NotThrowAsync(() =>
            UpdateHandler().Handle(new UpdateCustomerCommand(shyam, "Shyam K", Phone: "985-1000000"), CancellationToken.None).AsTask());

        var ex = await Should.ThrowAsync<CustomException>(() =>
            UpdateHandler().Handle(new UpdateCustomerCommand(shyam, "Shyam", Phone: "9841234567"), CancellationToken.None).AsTask());
        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    #endregion

    #region Payments

    [Fact]
    public void Payment_Validator_Should_Refuse_An_Unknown_Method()
    {
        var validator = new RecordCustomerPaymentCommandValidator();
        var id = Guid.CreateVersion7();
        DateTime paid = DateTime.UtcNow.Date;

        validator.TestValidate(new RecordCustomerPaymentCommand(id, 10m, paid, null, "bitcoin"))
            .ShouldHaveValidationErrorFor(x => x.PaymentMethod);
        validator.TestValidate(new RecordCustomerPaymentCommand(id, 10m, paid, null, "eSewa"))
            .ShouldNotHaveValidationErrorFor(x => x.PaymentMethod);
        validator.TestValidate(new RecordCustomerPaymentCommand(id, 10m, paid))
            .ShouldNotHaveValidationErrorFor(x => x.PaymentMethod);
    }

    [Fact]
    public async Task Payment_Should_Refuse_A_Cheque_Already_Recorded_From_The_Customer()
    {
        var customer = Customer.Create("Himal Distributors", null, null, null, 0m, "C-000001");
        _db.Customers.Add(customer);
        await _db.SaveChangesAsync();
        var mediator = Substitute.For<IMediator>();
        mediator.Send(Arg.Any<IsChequeNumberInUseQuery>(), Arg.Any<CancellationToken>()).Returns(true);
        var outbox = Substitute.For<IOutboxWriter>();
        var sut = new RecordCustomerPaymentCommandHandler(
            _db, outbox, Substitute.For<ICurrentUser>(), Substitute.For<ICurrentBranch>(),
            Substitute.For<ICustomerReceiptNumberService>(), mediator);
        DateTime paid = DateTime.UtcNow.Date;

        var ex = await Should.ThrowAsync<CustomException>(() => sut.Handle(
            new RecordCustomerPaymentCommand(customer.Id, 500m, paid, null, "cheque",
                ChequeNumber: " 004512 ", ChequeDateUtc: paid, ChequeBank: "Nabil"),
            CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        ex.Message.ShouldContain("004512");
        ex.Message.ShouldContain("Himal Distributors");
        await mediator.Received(1).Send(
            Arg.Is<IsChequeNumberInUseQuery>(q => q.PartyId == customer.Id && q.ChequeNumber == "004512"
                && q.PaymentReferenceType == ChequePaymentReferenceTypes.CustomerPayment),
            Arg.Any<CancellationToken>());
        _db.CustomerLedgerEntries.ShouldBeEmpty();
    }

    #endregion

    #region Aging, labels, entry types

    [Fact]
    public async Task Ar_Aging_Should_Report_An_Advance_So_The_Net_Total_Matches_The_Ledger()
    {
        var owes = Customer.Create("Owes", null, null, null, 0m, "C-000001");
        var advance = Customer.Create("Advance", null, null, null, 0m, "C-000002");
        _db.Customers.AddRange(owes, advance);
        var asOf = DateTime.UtcNow;
        _db.CustomerLedgerEntries.AddRange(
            CustomerLedgerEntry.Create(owes.Id, asOf.AddDays(-3), CustomerLedgerEntryType.Sale, "s", 1197.70m, 0m, 1197.70m),
            CustomerLedgerEntry.Create(advance.Id, asOf.AddDays(-3), CustomerLedgerEntryType.Payment, "advance", 0m, 1000m, -1000m));
        await _db.SaveChangesAsync();
        var branch = Substitute.For<ICurrentBranch>();
        branch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns((Guid?)null);

        var lines = await new GetArAgingReportQueryHandler(_db, branch).Handle(new GetArAgingReportQuery(asOf), CancellationToken.None);

        lines.Count.ShouldBe(2);
        lines.Sum(l => l.Total).ShouldBe(1197.70m);
        var advanceLine = lines.Single(l => l.CustomerId == advance.Id);
        advanceLine.Total.ShouldBe(0m);
        advanceLine.UnappliedAdvance.ShouldBe(1000m);
        lines.Sum(l => l.NetBalance).ShouldBe(197.70m);
    }

    [Fact]
    public async Task Return_Should_Be_Labelled_With_Its_Credit_Note_Number()
    {
        var customer = Customer.Create("Ram", null, null, null, 300m, "C-000001");
        _db.Customers.Add(customer);
        await _db.SaveChangesAsync();
        var returnId = Guid.CreateVersion7();

        await new ReturnCompletedIntegrationEventHandler(_db).HandleAsync(new ReturnCompletedIntegrationEvent(
            Guid.CreateVersion7(), DateTime.UtcNow, "test-tenant", "c", "Sales", returnId, Guid.CreateVersion7(),
            Guid.CreateVersion7(), 100m, [], CustomerId: customer.Id, OnAccountAmount: 100m, SaleTotalAmount: 300m,
            CreditNoteNumber: "CN-MAIN-2083/84-00007"));

        var entry = await _db.CustomerLedgerEntries.SingleAsync();
        entry.Description.ShouldBe("Return CN-MAIN-2083/84-00007");
        entry.DocumentNumber.ShouldBe("CN-MAIN-2083/84-00007");
        entry.EntryType.ShouldBe(CustomerLedgerEntryType.Refund);
    }

    [Fact]
    public void Return_Label_Should_Fall_Back_To_The_Short_Id()
    {
        var id = Guid.Parse("01a13a1e-0000-7000-8000-000000000000");
        ReturnCompletedIntegrationEventHandler.DocumentLabel(null, id).ShouldBe("01A13A1E");
        ReturnCompletedIntegrationEventHandler.DocumentLabel(" CN-1 ", id).ShouldBe("CN-1");
    }

    [Fact]
    public async Task Sale_Cancellation_Should_Get_Its_Own_Entry_Type()
    {
        var customer = Customer.Create("Ram", null, null, null, 120m, "C-000001");
        _db.Customers.Add(customer);
        await _db.SaveChangesAsync();

        await new SaleCancelledIntegrationEventHandler(_db).HandleAsync(new SaleCancelledIntegrationEvent(
            Guid.CreateVersion7(), DateTime.UtcNow, "test-tenant", "c", "Sales", Guid.CreateVersion7(), "void", [],
            BranchId: Guid.CreateVersion7(), CustomerId: customer.Id, OnAccountAmount: 120m, InvoiceNumber: "INV-1"));

        var entry = await _db.CustomerLedgerEntries.SingleAsync();
        entry.EntryType.ShouldBe(CustomerLedgerEntryType.SaleCancellation);
        entry.DocumentNumber.ShouldBe("INV-1");
    }

    #endregion

    #region Lookup without money

    [Fact]
    public void Redaction_Should_Strip_Money_Only_Without_Ledger_Access()
    {
        var dto = new CustomerDto(Guid.CreateVersion7(), "Ram", "98", null, null, 500m, true, DateTime.UtcNow, null,
            CreditLimit: 1000m, AvailableCredit: 500m, CreditDays: 30);

        var hidden = CustomerFinancialsRedaction.Apply(dto, canViewFinancials: false);
        hidden.CurrentBalance.ShouldBeNull();
        hidden.CreditLimit.ShouldBeNull();
        hidden.AvailableCredit.ShouldBeNull();
        hidden.Name.ShouldBe("Ram");
        hidden.Phone.ShouldBe("98");

        CustomerFinancialsRedaction.Apply(dto, canViewFinancials: true).ShouldBe(dto);
        CustomerFinancialsRedaction.Apply(new CustomerSummaryDto(dto.Id, 3, 900m, 1), false).TotalSpent.ShouldBeNull();
        CustomerFinancialsRedaction.Apply([new TopCustomerDto(dto.Id, "Ram", 3, 900m)], false)[0].TotalSpend.ShouldBeNull();
    }

    [Fact]
    public async Task Financials_Access_Should_Check_The_Ledger_View_Permission()
    {
        var user = Substitute.For<ICurrentUser>();
        var userId = Guid.CreateVersion7();
        user.GetUserId().Returns(userId);
        var permissions = Substitute.For<FSH.Modules.Identity.Contracts.Services.IUserPermissionService>();
        permissions.HasPermissionAsync(userId.ToString(), "Permissions.Customers.Ledger.View", Arg.Any<CancellationToken>()).Returns(true);

        (await new CustomerFinancialsAccess(user, permissions).CanViewAsync()).ShouldBeTrue();

        var anonymous = Substitute.For<ICurrentUser>();
        anonymous.GetUserId().Returns(Guid.Empty);
        (await new CustomerFinancialsAccess(anonymous, permissions).CanViewAsync()).ShouldBeFalse();
    }

    #endregion
}
