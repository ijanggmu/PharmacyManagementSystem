using System.Net;
using FluentValidation.TestHelper;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Customers.Contracts.Events;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.Features.v1.Customers.ImportCustomers;
using FSH.Modules.Customers.Services;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using NSubstitute.ExceptionExtensions;

namespace Customers.Tests.Features;

/// <summary>Customer spreadsheet import: row validation, all-or-nothing, dedupe by phone / PAN (skip or update),
/// and opening balances posted through the AR ledger + CustomerOpeningBalanceRecordedIntegrationEvent.</summary>
public sealed class ImportCustomersTests : IDisposable
{
    private readonly CustomersDbContext _db = CustomersDbContextFactory.Create();
    private readonly ICustomerCodeService _codes = Substitute.For<ICustomerCodeService>();
    private readonly ICustomerCreditPermissionGuard _credit = Substitute.For<ICustomerCreditPermissionGuard>();
    private readonly IUserPermissionService _permissions = Substitute.For<IUserPermissionService>();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly List<IIntegrationEvent> _events = [];
    private readonly Guid _branchId = Guid.CreateVersion7();
    private int _code;

    public ImportCustomersTests()
    {
        _codes.NextAsync(Arg.Any<CancellationToken>()).Returns(_ => $"C-{++_code:D6}");
        _currentUser.GetTenant().Returns("test-tenant");
        _currentUser.GetUserId().Returns(Guid.CreateVersion7());
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
        _permissions.HasPermissionAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(true);
        _outbox.AddAsync(Arg.Do<IIntegrationEvent>(_events.Add), Arg.Any<CancellationToken>()).Returns(Task.CompletedTask);
    }

    public void Dispose() => _db.Dispose();

    private ImportCustomersCommandHandler Sut() =>
        new(_db, _codes, _credit, _permissions, _outbox, _currentUser, _currentBranch);

    private async Task<Customer> SeedAsync(string name, string? phone, string? pan = null)
    {
        var customer = Customer.Create(name, phone, null, null, 0m, $"C-9{++_code:D5}");
        customer.SetPanNumber(pan);
        _db.Customers.Add(customer);
        await _db.SaveChangesAsync();
        _db.ChangeTracker.Clear();
        return customer;
    }

    private static DateOnly Today => CustomerImportKeys.NepalToday();

    [Fact]
    public async Task Bad_Cells_Should_Be_Reported_Per_Row_And_Column_And_Nothing_Saved()
    {
        var result = await Sut().Handle(new ImportCustomersCommand([
            new CustomerImportRow(2, "Hari", Phone: "9841000001"),
            new CustomerImportRow(3, "", Phone: "12", Email: "not-an-email", PanNumber: "12AB"),
            new CustomerImportRow(4, "Sita", AsOfDate: Today.AddDays(5), OpeningBalance: 100m),
        ]), CancellationToken.None);

        result.Committed.ShouldBeFalse();
        result.Failed.ShouldBe(2);
        result.Created.ShouldBe(1);
        var bad = result.Rows.Single(r => r.RowNumber == 3);
        bad.Status.ShouldBe(CustomerImportRowStatuses.Failed);
        bad.Errors.Select(e => e.Field).ShouldBe(["name", "phone", "email", "pan"], ignoreOrder: true);
        result.Rows.Single(r => r.RowNumber == 4).Errors.ShouldContain(e => e.Field == "as_of_date");

        // All-or-nothing: the valid row 2 was not saved either.
        (await _db.Customers.CountAsync()).ShouldBe(0);
        _events.ShouldBeEmpty();
    }

    [Fact]
    public async Task Dry_Run_Should_Return_The_Plan_Without_Writing()
    {
        var result = await Sut().Handle(
            new ImportCustomersCommand([new CustomerImportRow(2, "Hari", OpeningBalance: 500m)], DryRun: true),
            CancellationToken.None);

        result.DryRun.ShouldBeTrue();
        result.Committed.ShouldBeFalse();
        result.Created.ShouldBe(1);
        (await _db.Customers.CountAsync()).ShouldBe(0);
        _events.ShouldBeEmpty();
    }

    [Fact]
    public async Task Skip_Mode_Should_Match_An_Existing_Phone_Ignoring_Country_Code_And_Leave_It_Alone()
    {
        var existing = await SeedAsync("Ram", "+977-9841000001");

        var result = await Sut().Handle(new ImportCustomersCommand([
            new CustomerImportRow(2, "Ram Bahadur", Phone: "9841 000001", Email: "ram@example.com"),
            new CustomerImportRow(3, "Gita", Phone: "9841000002"),
        ]), CancellationToken.None);

        result.Committed.ShouldBeTrue();
        result.Skipped.ShouldBe(1);
        result.Created.ShouldBe(1);
        var skipped = result.Rows.Single(r => r.RowNumber == 2);
        skipped.CustomerId.ShouldBe(existing.Id);
        skipped.Warnings.ShouldNotBeEmpty();
        var stored = await _db.Customers.SingleAsync(c => c.Id == existing.Id);
        stored.Name.ShouldBe("Ram");
        stored.Email.ShouldBeNull();
    }

    [Fact]
    public async Task Update_Mode_Should_Fill_In_Fields_Match_By_Pan_And_Never_Post_An_Opening_Balance()
    {
        var existing = await SeedAsync("Shrestha Traders", "014400000", pan: "301234567");

        var result = await Sut().Handle(new ImportCustomersCommand([
            new CustomerImportRow(2, "Shrestha Traders Pvt", PanNumber: "301 234 567", Email: "acc@shrestha.com",
                CreditDays: 30, OpeningBalance: 2500m),
        ], CustomerImportDuplicateModes.Update), CancellationToken.None);

        result.Committed.ShouldBeTrue();
        result.Updated.ShouldBe(1);
        result.Rows[0].Warnings.ShouldContain(w => w.Contains("opening balance was not applied", StringComparison.Ordinal));
        var stored = await _db.Customers.SingleAsync(c => c.Id == existing.Id);
        stored.Name.ShouldBe("Shrestha Traders Pvt");
        stored.Email.ShouldBe("acc@shrestha.com");
        stored.Phone.ShouldBe("014400000"); // blank cell keeps the stored phone
        stored.CreditDays.ShouldBe(30);
        stored.CurrentBalance.ShouldBe(0m);
        _db.CustomerLedgerEntries.ShouldBeEmpty();
        _events.ShouldBeEmpty();
    }

    [Fact]
    public async Task Update_Mode_Without_The_Update_Permission_Should_Be_Forbidden()
    {
        await SeedAsync("Ram", "9841000001");
        _permissions.HasPermissionAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(false);

        var ex = await Should.ThrowAsync<CustomException>(() => Sut().Handle(
            new ImportCustomersCommand([new CustomerImportRow(2, "Ram", Phone: "9841000001")], CustomerImportDuplicateModes.Update),
            CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Repeated_Phone_Or_Pan_In_The_File_Should_Fail_The_Later_Row()
    {
        var result = await Sut().Handle(new ImportCustomersCommand([
            new CustomerImportRow(2, "A", Phone: "9841000001", PanNumber: "300000001"),
            new CustomerImportRow(3, "B", Phone: "+9779841000001"),
            new CustomerImportRow(4, "C", PanNumber: "300000001"),
        ]), CancellationToken.None);

        result.Committed.ShouldBeFalse();
        result.Rows.Single(r => r.RowNumber == 3).Errors.ShouldContain(e => e.Field == "phone" && e.Message.Contains("row 2", StringComparison.Ordinal));
        result.Rows.Single(r => r.RowNumber == 4).Errors.ShouldContain(e => e.Field == "pan");
    }

    [Fact]
    public async Task Phone_And_Pan_Matching_Different_Customers_Should_Fail_The_Row()
    {
        await SeedAsync("Ram", "9841000001");
        await SeedAsync("Shyam", "9841000002", pan: "300000009");

        var result = await Sut().Handle(new ImportCustomersCommand([
            new CustomerImportRow(2, "Ram", Phone: "9841000001", PanNumber: "300000009"),
        ]), CancellationToken.None);

        result.Rows[0].Status.ShouldBe(CustomerImportRowStatuses.Failed);
    }

    [Fact]
    public async Task Opening_Balances_Should_Post_Ledger_Entries_And_Events_Dated_At_The_As_Of_Date()
    {
        var fileAsOf = Today.AddDays(-30);
        var rowAsOf = Today.AddDays(-60);

        var result = await Sut().Handle(new ImportCustomersCommand([
            new CustomerImportRow(2, "Hari", Phone: "9841000001", PanNumber: "301111111", CreditDays: 15, OpeningBalance: 1250.50m),
            new CustomerImportRow(3, "Gita", OpeningBalance: -300m, AsOfDate: rowAsOf),
            new CustomerImportRow(4, "Sita"),
        ], AsOfDate: fileAsOf), CancellationToken.None);

        result.Committed.ShouldBeTrue();
        result.Created.ShouldBe(3);

        var hari = await _db.Customers.SingleAsync(c => c.Name == "Hari");
        hari.PanNumber.ShouldBe("301111111");
        hari.CurrentBalance.ShouldBe(1250.50m);
        var hariEntry = await _db.CustomerLedgerEntries.SingleAsync(e => e.CustomerId == hari.Id);
        hariEntry.EntryType.ShouldBe(CustomerLedgerEntryType.OpeningBalance);
        hariEntry.DebitAmount.ShouldBe(1250.50m);
        hariEntry.EntryDateUtc.ShouldBe(fileAsOf.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc));
        hariEntry.DueDateUtc.ShouldBe(fileAsOf.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc).AddDays(15));
        hariEntry.BranchId.ShouldBe(_branchId);

        var gita = await _db.Customers.SingleAsync(c => c.Name == "Gita");
        var gitaEntry = await _db.CustomerLedgerEntries.SingleAsync(e => e.CustomerId == gita.Id);
        gitaEntry.CreditAmount.ShouldBe(300m);
        gitaEntry.EntryDateUtc.ShouldBe(rowAsOf.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc));

        var events = _events.OfType<CustomerOpeningBalanceRecordedIntegrationEvent>().ToList();
        events.Count.ShouldBe(2);
        var hariEvent = events.Single(e => e.CustomerId == hari.Id);
        hariEvent.Amount.ShouldBe(1250.50m);
        hariEvent.LedgerEntryId.ShouldBe(hariEntry.Id);
        hariEvent.OccurredOnUtc.ShouldBe(hariEntry.EntryDateUtc); // Accounting dates the voucher with it
        hariEvent.BranchId.ShouldBe(_branchId);
        hariEvent.TenantId.ShouldBe("test-tenant");
        events.Single(e => e.CustomerId == gita.Id).Amount.ShouldBe(-300m);
        await _credit.Received().EnsureCanSetOpeningBalanceAsync(Arg.Any<CancellationToken>());
        await _credit.Received().EnsureCanManageCreditAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Opening_Balance_Without_The_Credit_Permission_Should_Be_Forbidden_And_Save_Nothing()
    {
        _credit.EnsureCanSetOpeningBalanceAsync(Arg.Any<CancellationToken>())
            .ThrowsAsync(new CustomException("no", (IEnumerable<string>?)null, HttpStatusCode.Forbidden));

        await Should.ThrowAsync<CustomException>(() => Sut().Handle(
            new ImportCustomersCommand([new CustomerImportRow(2, "Hari", OpeningBalance: 10m)]),
            CancellationToken.None).AsTask());

        (await _db.Customers.CountAsync()).ShouldBe(0);
    }

    [Fact]
    public void Validator_Should_Reject_Too_Many_Rows_And_Unknown_Modes()
    {
        var rows = Enumerable.Range(2, CustomerImportLimits.MaxRows + 1).Select(i => new CustomerImportRow(i, $"C{i}")).ToList();
        var validator = new ImportCustomersCommandValidator();

        validator.TestValidate(new ImportCustomersCommand(rows)).Errors.ShouldNotBeEmpty();
        validator.TestValidate(new ImportCustomersCommand([new CustomerImportRow(2, "A")], "merge")).ShouldHaveValidationErrorFor(c => c.DuplicateMode);
        validator.TestValidate(new ImportCustomersCommand([new CustomerImportRow(2, "A")])).ShouldNotHaveAnyValidationErrors();
    }

    [Theory]
    [InlineData("+977-9841234567", "9841234567")]
    [InlineData("9841 234 567", "9841234567")]
    [InlineData("01-4412345", "014412345")]
    [InlineData("12", null)]
    [InlineData("", null)]
    public void Phone_Key_Should_Ignore_Formatting_And_The_Country_Code(string phone, string? expected) =>
        CustomerImportKeys.PhoneKey(phone).ShouldBe(expected);
}
