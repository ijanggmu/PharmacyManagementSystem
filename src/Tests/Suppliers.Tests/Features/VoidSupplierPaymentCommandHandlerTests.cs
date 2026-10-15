using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.v1.Cheques;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.Events;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Features.v1.Ledger.GetApAgingReport;
using FSH.Modules.Suppliers.Features.v1.Ledger.GetSupplierLedger;
using FSH.Modules.Suppliers.Features.v1.Ledger.GetSupplierOpenBills;
using FSH.Modules.Suppliers.Features.v1.Ledger.RecordSupplierPayment;
using FSH.Modules.Suppliers.Features.v1.Ledger.VoidSupplierPayment;
using Mediator;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Suppliers.Tests.Features;

public sealed class VoidSupplierPaymentCommandHandlerTests : IDisposable
{
    private readonly SuppliersDbContext _db = SuppliersDbContextFactory.Create();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly Guid _branchId = Guid.CreateVersion7();

    public VoidSupplierPaymentCommandHandlerTests()
    {
        _currentUser.GetTenant().Returns("test-tenant");
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
        _mediator.Send(Arg.Any<GetChequeStatusForPaymentQuery>(), Arg.Any<CancellationToken>()).Returns((PaymentChequeStatusDto?)null);
    }

    public void Dispose() => _db.Dispose();

    private async Task<Supplier> SeedSupplierAsync()
    {
        var supplier = Supplier.Create("Himal Pharma", null, null, null, null, null, 0m);
        _db.Suppliers.Add(supplier);
        await _db.SaveChangesAsync();
        return supplier;
    }

    private async Task<Guid> AddBillAsync(Supplier supplier, decimal amount, DateTime date, string number)
    {
        var receiptId = Guid.CreateVersion7();
        decimal balance = supplier.ApplyLedgerEntry(amount, 0m);
        _db.SupplierLedgerEntries.Add(SupplierLedgerEntry.Create(
            supplier.Id, date, SupplierLedgerEntryType.Purchase, $"Purchase {number}", amount, 0m, balance,
            "DirectGoodsReceipt", receiptId, branchId: _branchId, documentNumber: number, supplierBillNumber: $"BILL-{number}"));
        await _db.SaveChangesAsync();
        return receiptId;
    }

    private Task<Guid> PayAsync(Supplier supplier, decimal amount, Guid? billId = null, DateTime? paidOn = null) =>
        new RecordSupplierPaymentCommandHandler(_db, _outbox, _currentUser, _currentBranch, Substitute.For<FSH.Modules.Suppliers.Services.ISupplierPaymentNumberService>(), Substitute.For<Mediator.IMediator>())
            .Handle(
                new RecordSupplierPaymentCommand(
                    supplier.Id, amount, paidOn ?? DateTime.UtcNow, "payment", "cash",
                    billId is null ? null : "DirectGoodsReceipt", billId),
                CancellationToken.None)
            .AsTask();

    private Task<Guid> VoidAsync(Supplier supplier, Guid paymentId, string reason = "keyed twice", bool fromRegister = false) =>
        new VoidSupplierPaymentCommandHandler(_db, _outbox, _currentUser, _currentBranch, _mediator)
            .Handle(new VoidSupplierPaymentCommand(supplier.Id, paymentId, reason) { BouncedFromChequeRegister = fromRegister }, CancellationToken.None)
            .AsTask();

    private Task<FSH.Modules.Suppliers.Contracts.Dtos.SupplierOpenBillsDto> OpenBillsAsync(Supplier supplier) =>
        new GetSupplierOpenBillsQueryHandler(_db, _currentBranch)
            .Handle(new GetSupplierOpenBillsQuery(supplier.Id, OnlyOpen: false), CancellationToken.None)
            .AsTask();

    [Fact]
    public async Task Void_Should_Restore_The_Balance_With_A_Reversing_Entry_And_Keep_The_Payment()
    {
        var supplier = await SeedSupplierAsync();
        var bill = await AddBillAsync(supplier, 100m, DateTime.UtcNow.AddDays(-10), "GRN-1");
        var paymentId = await PayAsync(supplier, 100m, bill);

        var voidId = await VoidAsync(supplier, paymentId);

        (await _db.Suppliers.AsNoTracking().SingleAsync(s => s.Id == supplier.Id)).CurrentBalance.ShouldBe(100m);
        (await _db.SupplierLedgerEntries.AsNoTracking().SingleAsync(e => e.Id == paymentId)).CreditAmount.ShouldBe(100m);
        var reversal = await _db.SupplierLedgerEntries.AsNoTracking().SingleAsync(e => e.Id == voidId);
        reversal.EntryType.ShouldBe(SupplierLedgerEntryType.Adjustment);
        reversal.DebitAmount.ShouldBe(100m);
        reversal.CreditAmount.ShouldBe(0m);
        reversal.RunningBalance.ShouldBe(100m);
        reversal.ReferenceType.ShouldBe(SupplierLedgerEntry.PaymentVoidReference);
        reversal.ReferenceId.ShouldBe(paymentId);
        reversal.BranchId.ShouldBe(_branchId);
        reversal.DocumentNumber.ShouldBe("GRN-1");
        reversal.Description!.ShouldContain("keyed twice");
    }

    [Fact]
    public async Task Void_Should_Publish_The_Voided_Event_Through_The_Outbox()
    {
        var supplier = await SeedSupplierAsync();
        await AddBillAsync(supplier, 100m, DateTime.UtcNow.AddDays(-10), "GRN-1");
        var paymentId = await PayAsync(supplier, 45m);

        var voidId = await VoidAsync(supplier, paymentId, "  wrong supplier ");

        await _outbox.Received(1).AddAsync(
            Arg.Is<SupplierPaymentVoidedIntegrationEvent>(e =>
                e.LedgerEntryId == paymentId
                && e.VoidEntryId == voidId
                && e.SupplierId == supplier.Id
                && e.Amount == 45m
                && e.Reason == "wrong supplier"
                && e.TenantId == "test-tenant"
                && e.BranchId == _branchId
                && e.VoidedAtUtc > DateTime.UtcNow.AddMinutes(-1)),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Voiding_A_Bill_Payment_Reopens_That_Bill()
    {
        var supplier = await SeedSupplierAsync();
        var older = await AddBillAsync(supplier, 100m, DateTime.UtcNow.AddDays(-20), "GRN-1");
        var newer = await AddBillAsync(supplier, 50m, DateTime.UtcNow.AddDays(-5), "GRN-2");
        var billPayment = await PayAsync(supplier, 50m, newer);
        await PayAsync(supplier, 30m);

        await VoidAsync(supplier, billPayment);

        var result = await OpenBillsAsync(supplier);
        var newerBill = result.Bills.Single(b => b.ReferenceId == newer);
        newerBill.Paid.ShouldBe(0m);
        newerBill.Outstanding.ShouldBe(50m);
        result.Bills.Single(b => b.ReferenceId == older).Outstanding.ShouldBe(70m);
        // No phantom bill for the void's debit; the open bills add up to the ledger balance.
        result.Bills.Count.ShouldBe(2);
        result.TotalOutstanding.ShouldBe(120m);
        result.UnappliedCredit.ShouldBe(0m);
        (await _db.Suppliers.AsNoTracking().SingleAsync(s => s.Id == supplier.Id)).CurrentBalance.ShouldBe(120m);
    }

    [Fact]
    public async Task Voiding_An_Unallocated_Payment_Reopens_The_Oldest_Bill()
    {
        var supplier = await SeedSupplierAsync();
        var older = await AddBillAsync(supplier, 100m, DateTime.UtcNow.AddDays(-100), "GRN-OLD");
        var paymentId = await PayAsync(supplier, 100m);
        await VoidAsync(supplier, paymentId);

        var bill = (await OpenBillsAsync(supplier)).Bills.ShouldHaveSingleItem();
        bill.ReferenceId.ShouldBe(older);
        bill.Outstanding.ShouldBe(100m);

        var aging = await new GetApAgingReportQueryHandler(_db, _currentBranch)
            .Handle(new GetApAgingReportQuery(DateTime.UtcNow.AddMinutes(1)), CancellationToken.None);
        var line = aging.ShouldHaveSingleItem();
        line.Over90.ShouldBe(100m);
        line.Current.ShouldBe(0m);
    }

    [Fact]
    public async Task Ap_Aging_Before_The_Void_Still_Shows_The_Payment()
    {
        var supplier = await SeedSupplierAsync();
        await AddBillAsync(supplier, 100m, DateTime.UtcNow.AddDays(-100), "GRN-OLD");
        var paymentId = await PayAsync(supplier, 100m, paidOn: DateTime.UtcNow.AddDays(-10));
        await VoidAsync(supplier, paymentId);

        // As of a moment before the void was recorded, the bill was paid.
        var aging = await new GetApAgingReportQueryHandler(_db, _currentBranch)
            .Handle(new GetApAgingReportQuery(DateTime.UtcNow.AddDays(-1)), CancellationToken.None);
        aging.ShouldBeEmpty();
    }

    [Fact]
    public async Task Voiding_Twice_Should_Be_Refused_With_Conflict_And_Change_Nothing()
    {
        var supplier = await SeedSupplierAsync();
        await AddBillAsync(supplier, 100m, DateTime.UtcNow.AddDays(-10), "GRN-1");
        var paymentId = await PayAsync(supplier, 60m);
        await VoidAsync(supplier, paymentId);

        var ex = await Should.ThrowAsync<CustomException>(() => VoidAsync(supplier, paymentId));

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await _db.Suppliers.AsNoTracking().SingleAsync(s => s.Id == supplier.Id)).CurrentBalance.ShouldBe(100m);
        (await _db.SupplierLedgerEntries.CountAsync(e => e.ReferenceType == SupplierLedgerEntry.PaymentVoidReference)).ShouldBe(1);
        await _outbox.Received(1).AddAsync(Arg.Any<SupplierPaymentVoidedIntegrationEvent>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Only_Payments_Can_Be_Voided()
    {
        var supplier = await SeedSupplierAsync();
        await AddBillAsync(supplier, 100m, DateTime.UtcNow.AddDays(-10), "GRN-1");
        var purchase = await _db.SupplierLedgerEntries.AsNoTracking().SingleAsync();

        var ex = await Should.ThrowAsync<CustomException>(() => VoidAsync(supplier, purchase.Id));
        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Payment_Of_Another_Supplier_Is_NotFound()
    {
        var supplier = await SeedSupplierAsync();
        await AddBillAsync(supplier, 100m, DateTime.UtcNow.AddDays(-10), "GRN-1");
        var paymentId = await PayAsync(supplier, 60m);
        var other = await SeedSupplierAsync();

        await Should.ThrowAsync<NotFoundException>(() => VoidAsync(other, paymentId));
    }

    [Fact]
    public async Task Ledger_Should_Flag_The_Voided_Payment_Only()
    {
        var supplier = await SeedSupplierAsync();
        await AddBillAsync(supplier, 100m, DateTime.UtcNow.AddDays(-10), "GRN-1");
        var voided = await PayAsync(supplier, 30m);
        var kept = await PayAsync(supplier, 20m);
        await VoidAsync(supplier, voided);

        var page = await new GetSupplierLedgerQueryHandler(_db, _currentBranch)
            .Handle(new GetSupplierLedgerQuery(supplier.Id), CancellationToken.None);

        page.Items.Single(i => i.Id == voided).IsVoided.ShouldBeTrue();
        page.Items.Single(i => i.Id == kept).IsVoided.ShouldBeFalse();
        page.Items.Count(i => i.IsVoided).ShouldBe(1);
    }

    [Fact]
    public void Validator_Should_Require_A_Reason()
    {
        var validator = new VoidSupplierPaymentCommandValidator();

        validator.Validate(new VoidSupplierPaymentCommand(Guid.NewGuid(), Guid.NewGuid(), "")).IsValid.ShouldBeFalse();
        validator.Validate(new VoidSupplierPaymentCommand(Guid.NewGuid(), Guid.NewGuid(), " x ")).IsValid.ShouldBeFalse();
        validator.Validate(new VoidSupplierPaymentCommand(Guid.Empty, Guid.NewGuid(), "duplicate")).IsValid.ShouldBeFalse();
        validator.Validate(new VoidSupplierPaymentCommand(Guid.NewGuid(), Guid.NewGuid(), "duplicate")).IsValid.ShouldBeTrue();
    }

    private void ChequeIs(Guid paymentId, string status) =>
        _mediator.Send(
                Arg.Is<GetChequeStatusForPaymentQuery>(q =>
                    q.PaymentId == paymentId && q.PaymentReferenceType == ChequePaymentReferenceTypes.SupplierPayment),
                Arg.Any<CancellationToken>())
            .Returns(new PaymentChequeStatusDto(Guid.CreateVersion7(), "000777", status, status == "cleared"));

    [Fact]
    public async Task Void_Of_A_Payment_Whose_Cheque_Has_Cleared_Should_Be_Refused_And_Point_To_The_Register()
    {
        var supplier = await SeedSupplierAsync();
        await AddBillAsync(supplier, 100m, DateTime.UtcNow.AddDays(-10), "GRN-1");
        var paymentId = await PayAsync(supplier, 60m);
        ChequeIs(paymentId, "cleared");

        var ex = await Should.ThrowAsync<CustomException>(() => VoidAsync(supplier, paymentId));

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        ex.Message.ShouldContain("000777");
        ex.Message.ShouldContain("bounced in the cheque register");
        (await _db.Suppliers.AsNoTracking().SingleAsync(s => s.Id == supplier.Id)).CurrentBalance.ShouldBe(40m);
        (await _db.SupplierLedgerEntries.AnyAsync(e => e.ReferenceType == SupplierLedgerEntry.PaymentVoidReference)).ShouldBeFalse();
        await _outbox.DidNotReceive().AddAsync(Arg.Any<SupplierPaymentVoidedIntegrationEvent>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Void_Of_A_Payment_Whose_Cheque_Is_Still_Issued_Should_Go_Ahead()
    {
        var supplier = await SeedSupplierAsync();
        await AddBillAsync(supplier, 100m, DateTime.UtcNow.AddDays(-10), "GRN-1");
        var paymentId = await PayAsync(supplier, 60m);
        ChequeIs(paymentId, "issued");

        await VoidAsync(supplier, paymentId);

        (await _db.Suppliers.AsNoTracking().SingleAsync(s => s.Id == supplier.Id)).CurrentBalance.ShouldBe(100m);
    }

    [Fact]
    public async Task The_Cheque_Registers_Own_Bounce_Of_A_Cleared_Cheque_Should_Void_The_Payment()
    {
        var supplier = await SeedSupplierAsync();
        await AddBillAsync(supplier, 100m, DateTime.UtcNow.AddDays(-10), "GRN-1");
        var paymentId = await PayAsync(supplier, 60m);
        ChequeIs(paymentId, "cleared");

        await VoidAsync(supplier, paymentId, "Cheque 000777 bounced: returned", fromRegister: true);

        (await _db.Suppliers.AsNoTracking().SingleAsync(s => s.Id == supplier.Id)).CurrentBalance.ShouldBe(100m);
        await _mediator.DidNotReceive().Send(Arg.Any<GetChequeStatusForPaymentQuery>(), Arg.Any<CancellationToken>());
    }

    private static readonly System.Text.Json.JsonSerializerOptions WebJson = new(System.Text.Json.JsonSerializerDefaults.Web);

    [Fact]
    public void The_Register_Bypass_Should_Never_Bind_From_A_Request_Body()
    {
        var command = System.Text.Json.JsonSerializer.Deserialize<VoidSupplierPaymentCommand>(
            """{"supplierId":"0196a3c2-0000-7000-8000-000000000001","paymentId":"0196a3c2-0000-7000-8000-000000000002","reason":"x","bouncedFromChequeRegister":true}""",
            WebJson);

        command.ShouldNotBeNull();
        command.BouncedFromChequeRegister.ShouldBeFalse();
    }
}
