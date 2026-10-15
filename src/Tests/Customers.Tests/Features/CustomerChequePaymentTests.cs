using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Customers.Contracts.Events;
using FSH.Modules.Customers.Contracts.v1.Ledger;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.Features.v1.Ledger.RecordCustomerPayment;
using FSH.Modules.Customers.Services;
using FSH.Modules.Multitenancy.Contracts;
using FluentValidation.TestHelper;
using NSubstitute;

namespace Customers.Tests.Features;

/// <summary>A receipt by cheque carries the cheque's number, date and bank on the event, for Accounting's cheque register.</summary>
public sealed class CustomerChequePaymentTests : IDisposable
{
    private static readonly DateTime Paid = DateTime.UtcNow.Date.AddDays(-1);

    private readonly CustomersDbContext _db = CustomersDbContextFactory.Create();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly ICustomerReceiptNumberService _receiptNumbers = Substitute.For<ICustomerReceiptNumberService>();

    public void Dispose() => _db.Dispose();

    [Fact]
    public async Task Cheque_Receipt_Should_Carry_The_Cheque_Details_On_The_Event()
    {
        var customer = Customer.Create("Himal Distributors", null, null, null, 0m, "C-000001");
        _db.Customers.Add(customer);
        await _db.SaveChangesAsync();
        DateTime chequeDate = Paid.AddDays(30);

        await new RecordCustomerPaymentCommandHandler(_db, _outbox, _currentUser, _currentBranch, _receiptNumbers, Substitute.For<Mediator.IMediator>()).Handle(
            new RecordCustomerPaymentCommand(customer.Id, 5000m, Paid, "PDC", "cheque",
                ChequeNumber: " 004512 ", ChequeDateUtc: chequeDate, ChequeBank: "Nabil Bank"),
            CancellationToken.None);

        await _outbox.Received(1).AddAsync(
            Arg.Is<CustomerPaymentRecordedIntegrationEvent>(e =>
                e.PaymentMethod == "cheque" && e.ChequeNumber == "004512" && e.ChequeDateUtc == chequeDate
                && e.ChequeBank == "Nabil Bank" && !e.ChequeClearedOnDeposit),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Receipt_Without_A_Cheque_Number_Should_Carry_No_Cheque()
    {
        var customer = Customer.Create("Ram", null, null, null, 0m, "C-000002");
        _db.Customers.Add(customer);
        await _db.SaveChangesAsync();

        await new RecordCustomerPaymentCommandHandler(_db, _outbox, _currentUser, _currentBranch, _receiptNumbers, Substitute.For<Mediator.IMediator>()).Handle(
            new RecordCustomerPaymentCommand(customer.Id, 100m, Paid, null, "cheque"), CancellationToken.None);

        await _outbox.Received(1).AddAsync(
            Arg.Is<CustomerPaymentRecordedIntegrationEvent>(e => e.ChequeNumber == null && e.ChequeDateUtc == null && !e.ChequeClearedOnDeposit),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public void Validator_Should_Check_The_Cheque_Fields()
    {
        var validator = new RecordCustomerPaymentCommandValidator();
        var id = Guid.CreateVersion7();

        // Cheque details on a cash payment.
        validator.TestValidate(new RecordCustomerPaymentCommand(id, 10m, Paid, null, "cash", ChequeNumber: "1", ChequeDateUtc: Paid))
            .ShouldHaveValidationErrorFor(x => x.ChequeNumber);
        // A number without its date.
        validator.TestValidate(new RecordCustomerPaymentCommand(id, 10m, Paid, null, "cheque", ChequeNumber: "1"))
            .ShouldHaveValidationErrorFor(x => x.ChequeDateUtc);
        // A date without the number.
        validator.TestValidate(new RecordCustomerPaymentCommand(id, 10m, Paid, null, "cheque", ChequeDateUtc: Paid))
            .ShouldHaveValidationErrorFor(x => x.ChequeNumber);
        // Stale (over six months old) and too far ahead.
        validator.TestValidate(new RecordCustomerPaymentCommand(id, 10m, Paid, null, "cheque", ChequeNumber: "1", ChequeDateUtc: Paid.AddDays(-200)))
            .ShouldHaveValidationErrorFor("ChequeDateUtc.Value");
        validator.TestValidate(new RecordCustomerPaymentCommand(id, 10m, Paid, null, "cheque", ChequeNumber: "1", ChequeDateUtc: Paid.AddDays(400)))
            .ShouldHaveValidationErrorFor("ChequeDateUtc.Value");
        // A post-dated cheque a month out is fine.
        validator.TestValidate(new RecordCustomerPaymentCommand(id, 10m, Paid, null, "Cheque", ChequeNumber: "1", ChequeDateUtc: Paid.AddDays(30), ChequeBank: "NIC Asia"))
            .IsValid.ShouldBeTrue();
    }
}
