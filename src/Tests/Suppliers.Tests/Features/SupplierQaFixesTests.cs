using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.v1.Cheques;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Features.v1.Ledger.GetApAgingReport;
using FSH.Modules.Suppliers.Features.v1.Ledger.GetSupplierStatement;
using FSH.Modules.Suppliers.Features.v1.Ledger.RecordSupplierPayment;
using FSH.Modules.Suppliers.Features.v1.Ledger.VoidSupplierPayment;
using FSH.Modules.Suppliers.Features.v1.Suppliers.CreateSupplier;
using FSH.Modules.Suppliers.Features.v1.Suppliers.UpdateSupplier;
using FSH.Modules.Suppliers.Services;
using FluentValidation.TestHelper;
using Mediator;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Suppliers.Tests.Features;

/// <summary>QA fixes: PAN rules, advances on the AP aging, payment methods, duplicate cheques, payment numbers
/// and voided payments on the statement.</summary>
public sealed class SupplierQaFixesTests : IDisposable
{
    private readonly SuppliersDbContext _db = SuppliersDbContextFactory.Create();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly ISupplierPaymentNumberService _paymentNumbers = Substitute.For<ISupplierPaymentNumberService>();
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly Guid _branchId = Guid.CreateVersion7();

    public SupplierQaFixesTests()
    {
        _currentUser.GetTenant().Returns("test-tenant");
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns((Guid?)null);
        _paymentNumbers.ResolveBranchCodeAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>()).Returns("MAIN");
        _paymentNumbers.ReserveNextAsync(Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>()).Returns(3);
        _mediator.Send(Arg.Any<GetChequeStatusForPaymentQuery>(), Arg.Any<CancellationToken>()).Returns((PaymentChequeStatusDto?)null);
    }

    public void Dispose() => _db.Dispose();

    private async Task<Supplier> SeedSupplierAsync(string name = "Himal Pharma", string? pan = null)
    {
        var supplier = Supplier.Create(name, null, null, null, null, pan, 0m);
        _db.Suppliers.Add(supplier);
        await _db.SaveChangesAsync();
        return supplier;
    }

    private CreateSupplierCommandHandler CreateHandler() =>
        new(_db, _currentBranch, Substitute.For<ISupplierLedgerPermissionGuard>(), _outbox, _currentUser);

    private RecordSupplierPaymentCommandHandler PaymentHandler() =>
        new(_db, _outbox, _currentUser, _currentBranch, _paymentNumbers, _mediator);

    #region PAN

    [Theory]
    [InlineData("12345")]
    [InlineData("ABCDEFGHI")]
    [InlineData("12AB")]
    public void Validators_Should_Refuse_A_Pan_That_Is_Not_9_Digits(string pan)
    {
        new CreateSupplierCommandValidator().TestValidate(new CreateSupplierCommand("Acme", TaxId: pan))
            .ShouldHaveValidationErrorFor(x => x.TaxId);
        new UpdateSupplierCommandValidator().TestValidate(new UpdateSupplierCommand(Guid.CreateVersion7(), "Acme", TaxId: pan))
            .ShouldHaveValidationErrorFor(x => x.TaxId);
    }

    [Fact]
    public void Validators_Should_Accept_A_Blank_Or_9_Digit_Pan()
    {
        var validator = new CreateSupplierCommandValidator();
        validator.TestValidate(new CreateSupplierCommand("Acme")).ShouldNotHaveValidationErrorFor(x => x.TaxId);
        validator.TestValidate(new CreateSupplierCommand("Acme", TaxId: "123 456 789")).ShouldNotHaveValidationErrorFor(x => x.TaxId);
    }

    [Fact]
    public async Task Create_Should_Refuse_A_Pan_Another_Active_Supplier_Has()
    {
        await SeedSupplierAsync("Himalayan", pan: "301234567");

        var ex = await Should.ThrowAsync<CustomException>(() =>
            CreateHandler().Handle(new CreateSupplierCommand("Other Pharma", TaxId: "301 234 567"), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await _db.Suppliers.CountAsync()).ShouldBe(1);
    }

    [Fact]
    public async Task Create_Should_Store_The_Pan_Without_Spaces()
    {
        var id = await CreateHandler().Handle(new CreateSupplierCommand("Acme", TaxId: " 301 234 567 "), CancellationToken.None);

        (await _db.Suppliers.AsNoTracking().SingleAsync(s => s.Id == id)).TaxId.ShouldBe("301234567");
    }

    [Fact]
    public async Task Update_Should_Refuse_Taking_Another_Suppliers_Pan_But_Keep_Its_Own()
    {
        await SeedSupplierAsync("Himalayan", pan: "301234567");
        var other = await SeedSupplierAsync("Other", pan: "309999999");
        var sut = new UpdateSupplierCommandHandler(_db);

        // Keeping its own PAN is not a clash.
        await sut.Handle(new UpdateSupplierCommand(other.Id, "Other Pharma", TaxId: "309999999"), CancellationToken.None);
        (await _db.Suppliers.AsNoTracking().SingleAsync(s => s.Id == other.Id)).Name.ShouldBe("Other Pharma");

        var ex = await Should.ThrowAsync<CustomException>(() =>
            sut.Handle(new UpdateSupplierCommand(other.Id, "Other", TaxId: "301234567"), CancellationToken.None).AsTask());
        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    #endregion

    #region Aging

    [Fact]
    public async Task Ap_Aging_Should_Report_An_Advance_So_The_Net_Total_Matches_The_Ledger()
    {
        var owed = await SeedSupplierAsync("Owed");
        var prepaid = await SeedSupplierAsync("Prepaid");
        var asOf = DateTime.UtcNow;
        _db.SupplierLedgerEntries.AddRange(
            SupplierLedgerEntry.Create(owed.Id, asOf.AddDays(-3), SupplierLedgerEntryType.Purchase, "bill", 11403.01m, 0m, 11403.01m),
            SupplierLedgerEntry.Create(prepaid.Id, asOf.AddDays(-3), SupplierLedgerEntryType.Payment, "advance", 0m, 2880m, -2880m));
        await _db.SaveChangesAsync();

        var lines = await new GetApAgingReportQueryHandler(_db, _currentBranch).Handle(new GetApAgingReportQuery(asOf), CancellationToken.None);

        lines.Count.ShouldBe(2);
        lines.Sum(l => l.Total).ShouldBe(11403.01m);
        var advance = lines.Single(l => l.SupplierId == prepaid.Id);
        advance.Total.ShouldBe(0m);
        advance.UnappliedAdvance.ShouldBe(2880m);
        lines.Sum(l => l.NetBalance).ShouldBe(8523.01m);
    }

    #endregion

    #region Payments

    [Fact]
    public void Payment_Validator_Should_Refuse_An_Unknown_Method()
    {
        var validator = new RecordSupplierPaymentCommandValidator();
        var id = Guid.CreateVersion7();
        DateTime paid = DateTime.UtcNow.Date;

        validator.TestValidate(new RecordSupplierPaymentCommand(id, 10m, paid, null, "bitcoin"))
            .ShouldHaveValidationErrorFor(x => x.PaymentMethod);
        validator.TestValidate(new RecordSupplierPaymentCommand(id, 10m, paid, null, "Khalti"))
            .ShouldNotHaveValidationErrorFor(x => x.PaymentMethod);
        validator.TestValidate(new RecordSupplierPaymentCommand(id, 10m, paid))
            .ShouldNotHaveValidationErrorFor(x => x.PaymentMethod);
    }

    [Fact]
    public async Task Payment_Should_Refuse_A_Cheque_Already_Issued_To_The_Supplier()
    {
        var supplier = await SeedSupplierAsync();
        _mediator.Send(Arg.Any<IsChequeNumberInUseQuery>(), Arg.Any<CancellationToken>()).Returns(true);
        DateTime paid = DateTime.UtcNow.Date;

        var ex = await Should.ThrowAsync<CustomException>(() => PaymentHandler().Handle(
            new RecordSupplierPaymentCommand(supplier.Id, 500m, paid, null, "cheque", ChequeNumber: " 7781 ", ChequeDateUtc: paid),
            CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        ex.Message.ShouldContain("7781");
        ex.Message.ShouldContain("Himal Pharma");
        await _mediator.Received(1).Send(
            Arg.Is<IsChequeNumberInUseQuery>(q => q.PartyId == supplier.Id && q.ChequeNumber == "7781"
                && q.PaymentReferenceType == ChequePaymentReferenceTypes.SupplierPayment),
            Arg.Any<CancellationToken>());
        _db.SupplierLedgerEntries.ShouldBeEmpty();
    }

    [Fact]
    public async Task Payment_Should_Get_A_Payment_Number_With_Branch_And_Fiscal_Year()
    {
        var supplier = await SeedSupplierAsync();
        var paidOn = new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc); // FY 2083/84

        var id = await PaymentHandler().Handle(new RecordSupplierPaymentCommand(supplier.Id, 500m, paidOn, null, "cash"), CancellationToken.None);

        (await _db.SupplierLedgerEntries.AsNoTracking().SingleAsync(e => e.Id == id)).PaymentNumber.ShouldBe("SPM-MAIN-2083/84-00003");
        await _paymentNumbers.Received(1).ReserveNextAsync(_branchId, 2083, Arg.Any<CancellationToken>());
    }

    [Fact]
    public void Payment_Number_Should_Only_Go_On_A_Payment()
    {
        var purchase = SupplierLedgerEntry.Create(Guid.CreateVersion7(), DateTime.UtcNow, SupplierLedgerEntryType.Purchase, null, 10m, 0m, 10m);
        Should.Throw<InvalidOperationException>(() => purchase.AssignPaymentNumber("SPM-1"));
    }

    [Fact]
    public async Task Statement_Should_Flag_A_Voided_Payment_And_Link_Its_Void()
    {
        var supplier = await SeedSupplierAsync();
        decimal balance = supplier.ApplyLedgerEntry(1000m, 0m);
        _db.SupplierLedgerEntries.Add(SupplierLedgerEntry.Create(
            supplier.Id, DateTime.UtcNow.AddDays(-2), SupplierLedgerEntryType.Purchase, "bill", 1000m, 0m, balance, branchId: _branchId));
        await _db.SaveChangesAsync();
        var paymentId = await PaymentHandler().Handle(
            new RecordSupplierPaymentCommand(supplier.Id, 400m, DateTime.UtcNow.AddDays(-1), null, "cash"), CancellationToken.None);
        await new VoidSupplierPaymentCommandHandler(_db, _outbox, _currentUser, _currentBranch, _mediator)
            .Handle(new VoidSupplierPaymentCommand(supplier.Id, paymentId, "keyed twice"), CancellationToken.None);

        var statement = await new GetSupplierStatementQueryHandler(_db, _currentBranch).Handle(
            new GetSupplierStatementQuery(supplier.Id, DateTime.UtcNow.AddDays(-10), DateTime.UtcNow.AddDays(1)), CancellationToken.None);

        var payment = statement.Lines.Single(l => l.Id == paymentId);
        payment.IsVoided.ShouldBeTrue();
        payment.PaymentNumber.ShouldNotBeNull().ShouldStartWith("SPM-MAIN-");
        statement.Lines.Single(l => l.VoidsEntryId == paymentId).IsVoided.ShouldBeFalse();
        statement.Lines.Where(l => l.Id != paymentId && l.VoidsEntryId is null).ShouldAllBe(l => !l.IsVoided);
        statement.ClosingBalance.ShouldBe(1000m);
    }

    #endregion
}
