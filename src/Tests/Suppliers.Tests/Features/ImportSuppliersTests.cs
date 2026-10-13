using System.Net;
using FluentValidation.TestHelper;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.Events;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Features.v1.Suppliers.ImportSuppliers;
using FSH.Modules.Suppliers.Services;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using NSubstitute.ExceptionExtensions;

namespace Suppliers.Tests.Features;

/// <summary>Supplier spreadsheet import: row validation, all-or-nothing, dedupe by PAN / name (skip or update), and
/// opening payables posted through the AP ledger + SupplierOpeningBalanceRecordedIntegrationEvent.</summary>
public sealed class ImportSuppliersTests : IDisposable
{
    private readonly SuppliersDbContext _db = SuppliersDbContextFactory.Create();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly ISupplierLedgerPermissionGuard _ledger = Substitute.For<ISupplierLedgerPermissionGuard>();
    private readonly IUserPermissionService _permissions = Substitute.For<IUserPermissionService>();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly List<IIntegrationEvent> _events = [];
    private readonly Guid _branchId = Guid.CreateVersion7();

    public ImportSuppliersTests()
    {
        _currentUser.GetTenant().Returns("test-tenant");
        _currentUser.GetUserId().Returns(Guid.CreateVersion7());
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
        _permissions.HasPermissionAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(true);
        _outbox.AddAsync(Arg.Do<IIntegrationEvent>(_events.Add), Arg.Any<CancellationToken>()).Returns(Task.CompletedTask);
    }

    public void Dispose() => _db.Dispose();

    private ImportSuppliersCommandHandler Sut() => new(_db, _currentBranch, _ledger, _permissions, _outbox, _currentUser);

    private async Task<Supplier> SeedAsync(string name, string? taxId = null, string? phone = null)
    {
        var supplier = Supplier.Create(name, null, phone, null, null, taxId, 0m);
        _db.Suppliers.Add(supplier);
        await _db.SaveChangesAsync();
        _db.ChangeTracker.Clear();
        return supplier;
    }

    private static DateOnly Today => SupplierImportKeys.NepalToday();

    [Fact]
    public async Task Bad_Cells_Should_Fail_Their_Rows_And_Save_Nothing()
    {
        var result = await Sut().Handle(new ImportSuppliersCommand([
            new SupplierImportRow(2, "Good Pharma"),
            new SupplierImportRow(3, " ", PanNumber: "ABC", CreditDays: 400, Email: "x"),
            new SupplierImportRow(4, "Late Pharma", OpeningBalance: 10.005m),
        ]), CancellationToken.None);

        result.Committed.ShouldBeFalse();
        result.Failed.ShouldBe(2);
        result.Rows.Single(r => r.RowNumber == 3).Errors.Select(e => e.Field)
            .ShouldBe(["name", "pan", "credit_days", "email"], ignoreOrder: true);
        result.Rows.Single(r => r.RowNumber == 4).Errors.ShouldContain(e => e.Field == "opening_balance");
        (await _db.Suppliers.CountAsync()).ShouldBe(0);
    }

    [Fact]
    public async Task Skip_Mode_Should_Match_By_Pan_Then_Name()
    {
        var byPan = await SeedAsync("Himal Drugs", taxId: "600000001");
        var byName = await SeedAsync("Everest Pharma");

        var result = await Sut().Handle(new ImportSuppliersCommand([
            new SupplierImportRow(2, "Himal Drug House", PanNumber: "600 000 001"),
            new SupplierImportRow(3, "  everest PHARMA "),
            new SupplierImportRow(4, "New Supplier", PanNumber: "600000002"),
        ]), CancellationToken.None);

        result.Committed.ShouldBeTrue();
        result.Skipped.ShouldBe(2);
        result.Created.ShouldBe(1);
        result.Rows.Single(r => r.RowNumber == 2).SupplierId.ShouldBe(byPan.Id);
        result.Rows.Single(r => r.RowNumber == 3).SupplierId.ShouldBe(byName.Id);
        (await _db.Suppliers.SingleAsync(s => s.Name == "New Supplier")).TaxId.ShouldBe("600000002");
    }

    [Fact]
    public async Task Update_Mode_Should_Keep_The_Name_Fill_Blanks_And_Skip_The_Opening_Balance()
    {
        var existing = await SeedAsync("Himal Drugs", taxId: "600000001", phone: "014000000");

        var result = await Sut().Handle(new ImportSuppliersCommand([
            new SupplierImportRow(2, "Himal Drug House", PanNumber: "600000001", ContactPerson: "Bikash", CreditDays: 45, OpeningBalance: 9000m),
        ], SupplierImportDuplicateModes.Update), CancellationToken.None);

        result.Committed.ShouldBeTrue();
        result.Updated.ShouldBe(1);
        result.Rows[0].Warnings.Count.ShouldBe(2); // name kept + opening balance not applied
        var stored = await _db.Suppliers.SingleAsync(s => s.Id == existing.Id);
        stored.Name.ShouldBe("Himal Drugs");
        stored.ContactPerson.ShouldBe("Bikash");
        stored.Phone.ShouldBe("014000000");
        stored.CreditDays.ShouldBe(45);
        _db.SupplierLedgerEntries.ShouldBeEmpty();
        _events.ShouldBeEmpty();
    }

    [Fact]
    public async Task Update_Mode_Without_The_Update_Permission_Should_Be_Forbidden()
    {
        await SeedAsync("Himal Drugs");
        _permissions.HasPermissionAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(false);

        var ex = await Should.ThrowAsync<CustomException>(() => Sut().Handle(
            new ImportSuppliersCommand([new SupplierImportRow(2, "Himal Drugs")], SupplierImportDuplicateModes.Update),
            CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Duplicates_Inside_The_File_And_Conflicting_Matches_Should_Fail()
    {
        await SeedAsync("Himal Drugs", taxId: "600000001");
        await SeedAsync("Everest Pharma");

        var result = await Sut().Handle(new ImportSuppliersCommand([
            new SupplierImportRow(2, "Alpha"),
            new SupplierImportRow(3, "ALPHA "),
            new SupplierImportRow(4, "Everest Pharma", PanNumber: "600000001"),
        ]), CancellationToken.None);

        result.Committed.ShouldBeFalse();
        result.Rows.Single(r => r.RowNumber == 3).Errors.ShouldContain(e => e.Field == "name");
        result.Rows.Single(r => r.RowNumber == 4).Errors.ShouldContain(e => e.Field == "pan");
    }

    [Fact]
    public async Task Opening_Payables_Should_Post_The_Ap_Ledger_And_Accounting_Event_On_The_As_Of_Date()
    {
        var asOf = Today.AddDays(-10);

        var result = await Sut().Handle(new ImportSuppliersCommand([
            new SupplierImportRow(2, "Himal Drugs", PanNumber: "600000001", CreditDays: 30, OpeningBalance: 45000m),
            new SupplierImportRow(3, "Everest Pharma", OpeningBalance: -1200m),
        ], AsOfDate: asOf), CancellationToken.None);

        result.Committed.ShouldBeTrue();
        var himal = await _db.Suppliers.SingleAsync(s => s.Name == "Himal Drugs");
        himal.CurrentBalance.ShouldBe(45000m);
        var entry = await _db.SupplierLedgerEntries.SingleAsync(e => e.SupplierId == himal.Id);
        entry.EntryType.ShouldBe(SupplierLedgerEntryType.OpeningBalance);
        entry.EntryDateUtc.ShouldBe(asOf.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc));
        entry.BranchId.ShouldBe(_branchId);

        var events = _events.OfType<SupplierOpeningBalanceRecordedIntegrationEvent>().ToList();
        events.Count.ShouldBe(2);
        var himalEvent = events.Single(e => e.SupplierId == himal.Id);
        himalEvent.Amount.ShouldBe(45000m);
        himalEvent.LedgerEntryId.ShouldBe(entry.Id);
        himalEvent.VoucherDateUtc.ShouldBe(entry.EntryDateUtc);
        himalEvent.BranchId.ShouldBe(_branchId);
        events.Single(e => e.SupplierName == "Everest Pharma").Amount.ShouldBe(-1200m);
        await _ledger.Received(1).EnsureCanManageOpeningBalanceAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Opening_Balance_Without_Permission_Should_Be_Forbidden_And_Save_Nothing()
    {
        _ledger.EnsureCanManageOpeningBalanceAsync(Arg.Any<CancellationToken>())
            .ThrowsAsync(new CustomException("no", (IEnumerable<string>?)null, HttpStatusCode.Forbidden));

        await Should.ThrowAsync<CustomException>(() => Sut().Handle(
            new ImportSuppliersCommand([new SupplierImportRow(2, "Himal Drugs", OpeningBalance: 10m)]),
            CancellationToken.None).AsTask());

        (await _db.Suppliers.CountAsync()).ShouldBe(0);
    }

    [Fact]
    public async Task Dry_Run_Should_Not_Write()
    {
        var result = await Sut().Handle(
            new ImportSuppliersCommand([new SupplierImportRow(2, "Himal Drugs", OpeningBalance: 10m)], DryRun: true),
            CancellationToken.None);

        result.Created.ShouldBe(1);
        result.Committed.ShouldBeFalse();
        (await _db.Suppliers.CountAsync()).ShouldBe(0);
        _events.ShouldBeEmpty();
    }

    [Fact]
    public void Validator_Should_Cap_The_Row_Count()
    {
        var rows = Enumerable.Range(2, SupplierImportLimits.MaxRows + 1).Select(i => new SupplierImportRow(i, $"S{i}")).ToList();
        new ImportSuppliersCommandValidator().TestValidate(new ImportSuppliersCommand(rows)).Errors.ShouldNotBeEmpty();
        new ImportSuppliersCommandValidator().TestValidate(new ImportSuppliersCommand([new SupplierImportRow(2, "S")]))
            .ShouldNotHaveAnyValidationErrors();
    }
}
