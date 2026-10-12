using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Contracts.v1.Ledger;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.Features.v1.Customers.CreateCustomer;
using FSH.Modules.Customers.Features.v1.Customers.DeleteCustomer;
using FSH.Modules.Customers.Features.v1.Customers.GetCustomerById;
using FSH.Modules.Customers.Features.v1.Customers.GetCustomerCreditStatus;
using FSH.Modules.Customers.Features.v1.Customers.UpdateCustomer;
using FSH.Modules.Customers.Features.v1.Ledger.GetArAgingReport;
using FSH.Modules.Customers.Features.v1.Ledger.GetTotalArBalance;
using FSH.Modules.Customers.Features.v1.Ledger.RecordCustomerPayment;
using FSH.Modules.Customers.IntegrationEventHandlers;
using FSH.Modules.Customers.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Reference.Contracts.v1.TenantSettings;
using FSH.Modules.Sales.Contracts.Events;
using FluentValidation.TestHelper;
using Mediator;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using NSubstitute.ExceptionExtensions;

namespace Customers.Tests.Features;

/// <summary>Medical fields round-trip, credit-limit permission, delete guard, inactive/deleted customers,
/// redelivered sale events and AR reporting.</summary>
public sealed class CustomerIntegrityTests : IDisposable
{
    private readonly CustomersDbContext _db = CustomersDbContextFactory.Create();
    private readonly ICustomerCreditPermissionGuard _allowCredit = Substitute.For<ICustomerCreditPermissionGuard>();
    private readonly ICustomerCreditPermissionGuard _denyCredit = Substitute.For<ICustomerCreditPermissionGuard>();

    public CustomerIntegrityTests()
    {
        _denyCredit.EnsureCanManageCreditAsync(Arg.Any<CancellationToken>())
            .ThrowsAsync(new CustomException("no", (IEnumerable<string>?)null, HttpStatusCode.Forbidden));
    }

    // ---- medical fields ----------------------------------------------------------------------

    [Fact]
    public async Task Create_And_Update_Should_Persist_And_Return_Medical_Lists()
    {
        var codes = Substitute.For<ICustomerCodeService>();
        codes.NextAsync(Arg.Any<CancellationToken>()).Returns("C-000010");

        var id = await new CreateCustomerCommandHandler(_db, codes, _allowCredit, Substitute.For<IOutboxWriter>(), Substitute.For<ICurrentUser>(), Substitute.For<ICurrentBranch>()).Handle(
            new CreateCustomerCommand(
                "Sita Rai", Allergies: ["Penicillin", " penicillin ", "Sulfa"],
                ChronicConditions: ["Diabetes"], CurrentMedications: ["Metformin"]),
            CancellationToken.None);

        var dto = await new GetCustomerByIdQueryHandler(_db).Handle(new GetCustomerByIdQuery(id), CancellationToken.None);
        dto.Allergies.ShouldBe(["Penicillin", "Sulfa"]);
        dto.ChronicConditions.ShouldBe(["Diabetes"]);
        dto.CurrentMedications.ShouldBe(["Metformin"]);

        await new UpdateCustomerCommandHandler(_db, _denyCredit).Handle(
            new UpdateCustomerCommand(id, "Sita Rai", Allergies: ["Aspirin"], CurrentMedications: []),
            CancellationToken.None);

        dto = await new GetCustomerByIdQueryHandler(_db).Handle(new GetCustomerByIdQuery(id), CancellationToken.None);
        dto.Allergies.ShouldBe(["Aspirin"]);
        dto.ChronicConditions.ShouldBe(["Diabetes"]); // null on update keeps the stored list
        dto.CurrentMedications.ShouldBeEmpty();
    }

    // ---- credit-limit permission -------------------------------------------------------------

    [Fact]
    public async Task Update_Should_Require_Credit_Permission_Only_When_The_Limit_Changes()
    {
        var customer = await SeedAsync(balance: 0m, creditLimit: 1000m);
        var sut = new UpdateCustomerCommandHandler(_db, _denyCredit);

        // Re-sending the stored limit (what the edit form does) is not a change.
        await sut.Handle(new UpdateCustomerCommand(customer.Id, "Ram", CreditLimit: 1000m), CancellationToken.None);

        var raise = await Should.ThrowAsync<CustomException>(async () =>
            await sut.Handle(new UpdateCustomerCommand(customer.Id, "Ram", CreditLimit: 5000m), CancellationToken.None));
        raise.StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        await Should.ThrowAsync<CustomException>(async () =>
            await sut.Handle(new UpdateCustomerCommand(customer.Id, "Ram", ClearCreditLimit: true), CancellationToken.None));
        customer.CreditLimit.ShouldBe(1000m);

        await new UpdateCustomerCommandHandler(_db, _allowCredit)
            .Handle(new UpdateCustomerCommand(customer.Id, "Ram", CreditLimit: 5000m), CancellationToken.None);
        customer.CreditLimit.ShouldBe(5000m);
    }

    [Fact]
    public async Task Create_With_A_Credit_Limit_Should_Require_Credit_Permission()
    {
        var codes = Substitute.For<ICustomerCodeService>();
        codes.NextAsync(Arg.Any<CancellationToken>()).Returns("C-000011");

        await Should.ThrowAsync<CustomException>(() => new CreateCustomerCommandHandler(_db, codes, _denyCredit, Substitute.For<IOutboxWriter>(), Substitute.For<ICurrentUser>(), Substitute.For<ICurrentBranch>())
            .Handle(new CreateCustomerCommand("Hari", CreditLimit: 500m), CancellationToken.None).AsTask());
        await new CreateCustomerCommandHandler(_db, codes, _denyCredit, Substitute.For<IOutboxWriter>(), Substitute.For<ICurrentUser>(), Substitute.For<ICurrentBranch>())
            .Handle(new CreateCustomerCommand("Hari"), CancellationToken.None);
    }

    // ---- delete guard ------------------------------------------------------------------------

    [Fact]
    public async Task Delete_Should_Be_Refused_While_The_Customer_Has_A_Balance()
    {
        var owes = await SeedAsync(balance: 250m);
        var ex = await Should.ThrowAsync<CustomException>(() =>
            new DeleteCustomerCommandHandler(_db).Handle(new DeleteCustomerCommand(owes.Id), CancellationToken.None).AsTask());
        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        ex.Message.ShouldContain("owes 250.00");

        var settled = await SeedAsync(balance: 0m, code: "C-000002");
        await new DeleteCustomerCommandHandler(_db).Handle(new DeleteCustomerCommand(settled.Id), CancellationToken.None);
    }

    // ---- credit status for the sale ----------------------------------------------------------

    [Fact]
    public async Task CreditStatus_Should_Refuse_Deleted_Inactive_And_Unknown_Customers()
    {
        var sut = new GetCustomerCreditStatusQueryHandler(_db);

        await Should.ThrowAsync<NotFoundException>(() =>
            sut.Handle(new GetCustomerCreditStatusQuery(Guid.CreateVersion7()), CancellationToken.None).AsTask());

        var deleted = await SeedAsync(balance: 0m, code: "C-000003");
        _db.Entry(deleted).Property(c => c.IsDeleted).CurrentValue = true;
        await _db.SaveChangesAsync();
        await Should.ThrowAsync<NotFoundException>(async () =>
            await sut.Handle(new GetCustomerCreditStatusQuery(deleted.Id), CancellationToken.None));

        var inactive = await SeedAsync(balance: 0m, code: "C-000004");
        inactive.Update("Ram", null, null, null, isActive: false);
        await _db.SaveChangesAsync();
        var ex = await Should.ThrowAsync<CustomException>(async () =>
            await sut.Handle(new GetCustomerCreditStatusQuery(inactive.Id), CancellationToken.None));
        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    // ---- SaleCompleted redelivery / deleted customer ------------------------------------------

    [Fact]
    public async Task SaleCompleted_Redelivered_Should_Apply_Once()
    {
        var mediator = LoyaltyMediator();
        var customer = await SeedAsync(balance: 0m);
        customer.SetMembership(true);
        customer.ApplyLoyaltyPoints(50, out _);
        await _db.SaveChangesAsync();
        var sale = SaleEvent(customer.Id, balanceDue: 300m, total: 1000m, redeemed: 20);
        var sut = new SaleCompletedIntegrationEventHandler(_db, mediator);

        await sut.HandleAsync(sale, CancellationToken.None);
        await sut.HandleAsync(sale with { Id = Guid.NewGuid() }, CancellationToken.None);

        customer.CurrentBalance.ShouldBe(300m);
        (await _db.CustomerLedgerEntries.CountAsync()).ShouldBe(1);
        customer.LoyaltyPoints.ShouldBe(50 - 20 + 10);
        (await _db.CustomerLoyaltyEntries.CountAsync()).ShouldBe(2);
    }

    [Fact]
    public async Task SaleCompleted_Should_Still_Debit_A_Customer_Deleted_After_The_Sale()
    {
        var customer = await SeedAsync(balance: 0m);
        _db.Entry(customer).Property(c => c.IsDeleted).CurrentValue = true;
        await _db.SaveChangesAsync();

        await new SaleCompletedIntegrationEventHandler(_db, LoyaltyMediator(enabled: false))
            .HandleAsync(SaleEvent(customer.Id, balanceDue: 120m, total: 120m, redeemed: 0), CancellationToken.None);

        customer.CurrentBalance.ShouldBe(120m);
        var total = await new GetTotalArBalanceQueryHandler(_db).Handle(new GetTotalArBalanceQuery(), CancellationToken.None);
        total.ShouldBe(120m);
    }

    // ---- AR aging ----------------------------------------------------------------------------

    [Fact]
    public async Task ArAging_Should_Apply_An_Advance_Payment_To_Later_Debits()
    {
        var customer = await SeedAsync(balance: 0m);
        var asOf = DateTime.UtcNow;
        // Paid 500 in advance 100 days ago, then bought 300 (80 days ago) and 400 (10 days ago): owes 200, all current.
        _db.CustomerLedgerEntries.AddRange(
            CustomerLedgerEntry.Create(customer.Id, asOf.AddDays(-100), CustomerLedgerEntryType.Payment, "adv", 0m, 500m, -500m),
            CustomerLedgerEntry.Create(customer.Id, asOf.AddDays(-80), CustomerLedgerEntryType.Sale, "s1", 300m, 0m, -200m),
            CustomerLedgerEntry.Create(customer.Id, asOf.AddDays(-10), CustomerLedgerEntryType.Sale, "s2", 400m, 0m, 200m));
        await _db.SaveChangesAsync();
        var branch = Substitute.For<ICurrentBranch>();
        branch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns((Guid?)null);

        var lines = await new GetArAgingReportQueryHandler(_db, branch).Handle(new GetArAgingReportQuery(asOf), CancellationToken.None);

        var line = lines.ShouldHaveSingleItem();
        line.Total.ShouldBe(200m);
        line.Current.ShouldBe(200m);
        line.Days61To90.ShouldBe(0m);
    }

    [Fact]
    public void ArAging_Settlement_Should_Net_To_Zero_For_A_Customer_In_Credit()
    {
        var open = GetArAgingReportQueryHandler.SettleFifo(
        [
            (DateTime.UtcNow.AddDays(-5), 0m, 1000m),
            (DateTime.UtcNow.AddDays(-3), 400m, 0m),
        ]);

        open.ShouldBeEmpty();
    }

    // ---- payment date ------------------------------------------------------------------------

    [Fact]
    public void Payment_Validator_Should_Reject_Missing_Future_And_Ancient_Dates()
    {
        var validator = new RecordCustomerPaymentCommandValidator();
        var id = Guid.CreateVersion7();

        validator.TestValidate(new RecordCustomerPaymentCommand(id, 10m, default)).ShouldHaveValidationErrorFor(x => x.PaymentDateUtc);
        validator.TestValidate(new RecordCustomerPaymentCommand(id, 10m, DateTime.UtcNow.AddDays(3))).ShouldHaveValidationErrorFor(x => x.PaymentDateUtc);
        validator.TestValidate(new RecordCustomerPaymentCommand(id, 10m, DateTime.UtcNow.AddYears(-2))).ShouldHaveValidationErrorFor(x => x.PaymentDateUtc);
        validator.TestValidate(new RecordCustomerPaymentCommand(id, 10m, DateTime.UtcNow.AddDays(-3))).ShouldNotHaveValidationErrorFor(x => x.PaymentDateUtc);
    }

    private static IMediator LoyaltyMediator(bool enabled = true)
    {
        var mediator = Substitute.For<IMediator>();
        var settings = enabled
            ? new Dictionary<string, string>
            {
                ["loyalty.enabled"] = "true",
                ["loyalty.amount_per_point"] = "100",
                ["loyalty.point_value"] = "1",
            }
            : new Dictionary<string, string>();
        mediator.Send(Arg.Any<GetTenantSettingsQuery>(), Arg.Any<CancellationToken>()).Returns(settings);
        return mediator;
    }

    private static SaleCompletedIntegrationEvent SaleEvent(Guid customerId, decimal balanceDue, decimal total, int redeemed) =>
        new(Guid.NewGuid(), DateTime.UtcNow, "test-tenant", "c", "Sales",
            SaleId: Guid.CreateVersion7(), BranchId: Guid.CreateVersion7(), CustomerId: customerId, PrescriptionId: null,
            PaymentMethod: "cash", PaymentAmount: total - balanceDue, TotalAmount: total, BalanceDue: balanceDue,
            VatAmount: 0m, TotalCost: 0m, Lines: [], Payments: [], InvoiceNumber: "INV-1", LoyaltyPointsRedeemed: redeemed);

    private async Task<Customer> SeedAsync(decimal balance, decimal? creditLimit = null, string code = "C-000001")
    {
        var customer = Customer.Create("Ram", null, null, null, balance, code, creditLimit);
        _db.Customers.Add(customer);
        await _db.SaveChangesAsync();
        return customer;
    }

    public void Dispose() => _db.Dispose();
}
