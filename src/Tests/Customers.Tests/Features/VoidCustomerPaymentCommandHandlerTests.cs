using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.v1.Cheques;
using FSH.Modules.Customers.Contracts.Events;
using FSH.Modules.Customers.Contracts.v1.Ledger;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.Features.v1.Ledger.GetArAgingReport;
using FSH.Modules.Customers.Features.v1.Ledger.GetCashCustomerReceipts;
using FSH.Modules.Customers.Features.v1.Ledger.GetCustomerLedger;
using FSH.Modules.Customers.Features.v1.Ledger.RecordCustomerPayment;
using FSH.Modules.Customers.Features.v1.Ledger.VoidCustomerPayment;
using FSH.Modules.Customers.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using System.Net;

namespace Customers.Tests.Features;

public sealed class VoidCustomerPaymentCommandHandlerTests : IDisposable
{
    private readonly CustomersDbContext _db = CustomersDbContextFactory.Create();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly ICustomerReceiptNumberService _receiptNumbers = Substitute.For<ICustomerReceiptNumberService>();
    private readonly Guid _branchId = Guid.CreateVersion7();

    public VoidCustomerPaymentCommandHandlerTests()
    {
        _currentUser.GetTenant().Returns("test-tenant");
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0));
        _receiptNumbers.ResolveBranchCodeAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>()).Returns("MAIN");
        _receiptNumbers.ReserveNextAsync(Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>()).Returns(7);
        _mediator.Send(Arg.Any<GetChequeStatusForPaymentQuery>(), Arg.Any<CancellationToken>()).Returns((PaymentChequeStatusDto?)null);
    }

    public void Dispose() => _db.Dispose();

    private VoidCustomerPaymentCommandHandler Sut() => new(_db, _outbox, _currentUser, _currentBranch, _mediator);

    private async Task<Customer> SeedCustomerWithSaleAsync(decimal owed = 100m)
    {
        var customer = Customer.Create("Jane Doe", null, null, null, 0m, "C-000001");
        _db.Customers.Add(customer);
        decimal balance = customer.ApplyLedgerEntry(owed, 0m);
        _db.CustomerLedgerEntries.Add(CustomerLedgerEntry.Create(
            customer.Id, DateTime.UtcNow.AddDays(-40), CustomerLedgerEntryType.Sale, "sale", owed, 0m, balance, branchId: _branchId));
        await _db.SaveChangesAsync();
        return customer;
    }

    private Task<Guid> PayAsync(Customer customer, decimal amount, string? method = "cash") =>
        new RecordCustomerPaymentCommandHandler(_db, _outbox, _currentUser, _currentBranch, _receiptNumbers)
            .Handle(new RecordCustomerPaymentCommand(customer.Id, amount, DateTime.UtcNow, "receipt", method), CancellationToken.None)
            .AsTask();

    private Task<Guid> VoidAsync(Customer customer, Guid paymentId, string reason = "keyed twice") =>
        Sut().Handle(new VoidCustomerPaymentCommand(customer.Id, paymentId, reason), CancellationToken.None).AsTask();

    [Fact]
    public async Task Void_Should_Restore_The_Balance_With_A_Reversing_Entry_And_Keep_The_Payment()
    {
        var customer = await SeedCustomerWithSaleAsync(100m);
        var paymentId = await PayAsync(customer, 60m);

        var voidId = await VoidAsync(customer, paymentId);

        (await _db.Customers.AsNoTracking().SingleAsync(c => c.Id == customer.Id)).CurrentBalance.ShouldBe(100m);
        var payment = await _db.CustomerLedgerEntries.AsNoTracking().SingleAsync(e => e.Id == paymentId);
        payment.CreditAmount.ShouldBe(60m);
        var reversal = await _db.CustomerLedgerEntries.AsNoTracking().SingleAsync(e => e.Id == voidId);
        reversal.EntryType.ShouldBe(CustomerLedgerEntryType.Adjustment);
        reversal.DebitAmount.ShouldBe(60m);
        reversal.CreditAmount.ShouldBe(0m);
        reversal.RunningBalance.ShouldBe(100m);
        reversal.ReferenceType.ShouldBe(CustomerLedgerEntry.PaymentVoidReference);
        reversal.ReferenceId.ShouldBe(paymentId);
        reversal.BranchId.ShouldBe(_branchId);
        reversal.DocumentNumber.ShouldBe(payment.DocumentNumber);
        reversal.PaymentMethod.ShouldBe("CASH");
        reversal.Description!.ShouldContain("keyed twice");
    }

    [Fact]
    public async Task Void_Should_Publish_The_Voided_Event_Through_The_Outbox()
    {
        var customer = await SeedCustomerWithSaleAsync();
        var paymentId = await PayAsync(customer, 40m);

        var voidId = await VoidAsync(customer, paymentId, "  wrong customer  ");

        await _outbox.Received(1).AddAsync(
            Arg.Is<CustomerPaymentVoidedIntegrationEvent>(e =>
                e.LedgerEntryId == paymentId
                && e.VoidEntryId == voidId
                && e.CustomerId == customer.Id
                && e.Amount == 40m
                && e.Reason == "wrong customer"
                && e.TenantId == "test-tenant"
                && e.BranchId == _branchId
                && e.ReceiptNumber != null
                && e.VoidedAtUtc > DateTime.UtcNow.AddMinutes(-1)),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Voiding_Twice_Should_Be_Refused_With_Conflict_And_Change_Nothing()
    {
        var customer = await SeedCustomerWithSaleAsync(100m);
        var paymentId = await PayAsync(customer, 60m);
        await VoidAsync(customer, paymentId);

        var ex = await Should.ThrowAsync<CustomException>(() => VoidAsync(customer, paymentId));

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await _db.Customers.AsNoTracking().SingleAsync(c => c.Id == customer.Id)).CurrentBalance.ShouldBe(100m);
        (await _db.CustomerLedgerEntries.CountAsync(e => e.ReferenceType == CustomerLedgerEntry.PaymentVoidReference)).ShouldBe(1);
        await _outbox.Received(1).AddAsync(Arg.Any<CustomerPaymentVoidedIntegrationEvent>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Only_Payments_Can_Be_Voided()
    {
        var customer = await SeedCustomerWithSaleAsync();
        var sale = await _db.CustomerLedgerEntries.AsNoTracking().SingleAsync(e => e.EntryType == CustomerLedgerEntryType.Sale);

        var ex = await Should.ThrowAsync<CustomException>(() => VoidAsync(customer, sale.Id));

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task The_Void_Entry_Itself_Cannot_Be_Voided()
    {
        var customer = await SeedCustomerWithSaleAsync();
        var paymentId = await PayAsync(customer, 30m);
        var voidId = await VoidAsync(customer, paymentId);

        var ex = await Should.ThrowAsync<CustomException>(() => VoidAsync(customer, voidId));
        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Payment_Of_Another_Customer_Is_NotFound()
    {
        var customer = await SeedCustomerWithSaleAsync();
        var paymentId = await PayAsync(customer, 30m);
        var other = Customer.Create("Other", null, null, null, 0m, "C-000002");
        _db.Customers.Add(other);
        await _db.SaveChangesAsync();

        await Should.ThrowAsync<NotFoundException>(() => VoidAsync(other, paymentId));
    }

    [Fact]
    public async Task Payment_At_A_Branch_The_Caller_Cannot_See_Is_NotFound()
    {
        var customer = await SeedCustomerWithSaleAsync();
        var paymentId = await PayAsync(customer, 30m);
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(Guid.CreateVersion7());
        _currentBranch.CanViewAllBranchesAsync(Arg.Any<CancellationToken>()).Returns(false);

        await Should.ThrowAsync<NotFoundException>(() => VoidAsync(customer, paymentId));
        (await _db.CustomerLedgerEntries.CountAsync(e => e.ReferenceType == CustomerLedgerEntry.PaymentVoidReference)).ShouldBe(0);
    }

    [Fact]
    public async Task Ledger_Should_Flag_The_Voided_Payment_Only()
    {
        var customer = await SeedCustomerWithSaleAsync();
        var voided = await PayAsync(customer, 30m);
        var kept = await PayAsync(customer, 20m);
        await VoidAsync(customer, voided);

        var page = await new GetCustomerLedgerQueryHandler(_db, _currentBranch)
            .Handle(new GetCustomerLedgerQuery(customer.Id), CancellationToken.None);

        page.Items.Single(i => i.Id == voided).IsVoided.ShouldBeTrue();
        page.Items.Single(i => i.Id == kept).IsVoided.ShouldBeFalse();
        page.Items.Count(i => i.IsVoided).ShouldBe(1);
    }

    [Fact]
    public async Task Ar_Aging_Should_Reopen_The_Debt_At_Its_Original_Age()
    {
        var customer = await SeedCustomerWithSaleAsync(100m);
        var paymentId = await PayAsync(customer, 100m);
        await VoidAsync(customer, paymentId);

        var aging = await new GetArAgingReportQueryHandler(_db, _currentBranch)
            .Handle(new GetArAgingReportQuery(DateTime.UtcNow.AddMinutes(1)), CancellationToken.None);

        // The void's debit is not aged as a fresh debt: the 40-day-old sale is open again.
        var line = aging.ShouldHaveSingleItem();
        line.Days31To60.ShouldBe(100m);
        line.Current.ShouldBe(0m);
    }

    [Fact]
    public async Task Cash_Drawer_Should_Take_The_Voided_Cash_Back_Out()
    {
        var customer = await SeedCustomerWithSaleAsync(500m);
        var from = DateTime.UtcNow.AddMinutes(-1);
        var cash = await PayAsync(customer, 40m, "cash");
        await PayAsync(customer, 25m, "cash");
        var card = await PayAsync(customer, 70m, "card");
        await VoidAsync(customer, cash);
        await VoidAsync(customer, card);

        decimal drawer = await new GetCashCustomerReceiptsQueryHandler(_db)
            .Handle(new GetCashCustomerReceiptsQuery(_branchId, from, DateTime.UtcNow.AddMinutes(1)), CancellationToken.None);

        drawer.ShouldBe(25m);
    }

    [Fact]
    public void Validator_Should_Require_A_Reason()
    {
        var validator = new VoidCustomerPaymentCommandValidator();

        validator.Validate(new VoidCustomerPaymentCommand(Guid.NewGuid(), Guid.NewGuid(), "")).IsValid.ShouldBeFalse();
        validator.Validate(new VoidCustomerPaymentCommand(Guid.NewGuid(), Guid.NewGuid(), "  a ")).IsValid.ShouldBeFalse();
        validator.Validate(new VoidCustomerPaymentCommand(Guid.NewGuid(), Guid.Empty, "duplicate")).IsValid.ShouldBeFalse();
        validator.Validate(new VoidCustomerPaymentCommand(Guid.NewGuid(), Guid.NewGuid(), "duplicate")).IsValid.ShouldBeTrue();
    }

    private void ChequeIs(Guid paymentId, string status) =>
        _mediator.Send(
                Arg.Is<GetChequeStatusForPaymentQuery>(q =>
                    q.PaymentId == paymentId && q.PaymentReferenceType == ChequePaymentReferenceTypes.CustomerPayment),
                Arg.Any<CancellationToken>())
            .Returns(new PaymentChequeStatusDto(Guid.CreateVersion7(), "004512", status, status == "cleared"));

    [Fact]
    public async Task Void_Of_A_Receipt_Whose_Cheque_Has_Cleared_Should_Be_Refused_And_Point_To_The_Register()
    {
        var customer = await SeedCustomerWithSaleAsync(100m);
        var paymentId = await PayAsync(customer, 60m, "cheque");
        ChequeIs(paymentId, "cleared");

        var ex = await Should.ThrowAsync<CustomException>(() => VoidAsync(customer, paymentId));

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        ex.Message.ShouldContain("004512");
        ex.Message.ShouldContain("bounced in the cheque register");
        ex.Message.ShouldContain("reversing entry");
        (await _db.Customers.AsNoTracking().SingleAsync(c => c.Id == customer.Id)).CurrentBalance.ShouldBe(40m);
        (await _db.CustomerLedgerEntries.AnyAsync(e => e.ReferenceType == CustomerLedgerEntry.PaymentVoidReference)).ShouldBeFalse();
        await _outbox.DidNotReceive().AddAsync(Arg.Any<CustomerPaymentVoidedIntegrationEvent>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Void_Of_A_Receipt_Whose_Cheque_Has_Not_Cleared_Should_Go_Ahead()
    {
        var customer = await SeedCustomerWithSaleAsync(100m);
        var paymentId = await PayAsync(customer, 60m, "cheque");
        ChequeIs(paymentId, "deposited");

        await VoidAsync(customer, paymentId);

        (await _db.Customers.AsNoTracking().SingleAsync(c => c.Id == customer.Id)).CurrentBalance.ShouldBe(100m);
    }

    [Fact]
    public async Task The_Cheque_Registers_Own_Bounce_Of_A_Cleared_Cheque_Should_Void_The_Receipt()
    {
        var customer = await SeedCustomerWithSaleAsync(100m);
        var paymentId = await PayAsync(customer, 60m, "cheque");
        ChequeIs(paymentId, "cleared");

        await Sut().Handle(
            new VoidCustomerPaymentCommand(customer.Id, paymentId, "Cheque 004512 bounced: returned") { BouncedFromChequeRegister = true },
            CancellationToken.None);

        (await _db.Customers.AsNoTracking().SingleAsync(c => c.Id == customer.Id)).CurrentBalance.ShouldBe(100m);
        await _mediator.DidNotReceive().Send(Arg.Any<GetChequeStatusForPaymentQuery>(), Arg.Any<CancellationToken>());
    }

    private static readonly System.Text.Json.JsonSerializerOptions WebJson = new(System.Text.Json.JsonSerializerDefaults.Web);

    [Fact]
    public void The_Register_Bypass_Should_Never_Bind_From_A_Request_Body()
    {
        var command = System.Text.Json.JsonSerializer.Deserialize<VoidCustomerPaymentCommand>(
            """{"customerId":"0196a3c2-0000-7000-8000-000000000001","paymentId":"0196a3c2-0000-7000-8000-000000000002","reason":"x","bouncedFromChequeRegister":true}""",
            WebJson);

        command.ShouldNotBeNull();
        command.BouncedFromChequeRegister.ShouldBeFalse();
    }
}
