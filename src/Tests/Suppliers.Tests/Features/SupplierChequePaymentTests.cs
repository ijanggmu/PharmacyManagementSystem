using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.Events;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Features.v1.Ledger.RecordSupplierPayment;
using FluentValidation.TestHelper;
using NSubstitute;

namespace Suppliers.Tests.Features;

/// <summary>A payment by cheque carries the cheque's number, date and bank on the event, for Accounting's cheque register.</summary>
public sealed class SupplierChequePaymentTests
{
    private static readonly DateTime Paid = DateTime.UtcNow.Date.AddDays(-1);

    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly SuppliersDbContext _dbContext = SuppliersDbContextFactory.Create();

    [Fact]
    public async Task Cheque_Payment_Should_Carry_The_Cheque_Details_On_The_Event()
    {
        var supplier = Supplier.Create("Deurali Janta", null, null, null, null, null, 9000m);
        _dbContext.Suppliers.Add(supplier);
        await _dbContext.SaveChangesAsync();
        DateTime chequeDate = Paid.AddDays(45);

        await new RecordSupplierPaymentCommandHandler(_dbContext, _outbox, _currentUser, _currentBranch).Handle(
            new RecordSupplierPaymentCommand(supplier.Id, 9000m, Paid, "PDC", "cheque",
                ChequeNumber: "778899", ChequeDateUtc: chequeDate, ChequeBank: " Global IME ", ChequeClearedOnDeposit: false),
            CancellationToken.None);

        await _outbox.Received(1).AddAsync(
            Arg.Is<SupplierPaymentRecordedIntegrationEvent>(e =>
                e.ChequeNumber == "778899" && e.ChequeDateUtc == chequeDate && e.ChequeBank == "Global IME" && !e.ChequeClearedOnDeposit),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public void Validator_Should_Check_The_Cheque_Fields()
    {
        var validator = new RecordSupplierPaymentCommandValidator();
        var id = Guid.CreateVersion7();

        validator.TestValidate(new RecordSupplierPaymentCommand(id, 10m, Paid, null, "bank", ChequeNumber: "1", ChequeDateUtc: Paid))
            .ShouldHaveValidationErrorFor(x => x.ChequeNumber);
        validator.TestValidate(new RecordSupplierPaymentCommand(id, 10m, Paid, null, "cheque", ChequeNumber: "1"))
            .ShouldHaveValidationErrorFor(x => x.ChequeDateUtc);
        validator.TestValidate(new RecordSupplierPaymentCommand(id, 10m, Paid, null, "cheque", ChequeClearedOnDeposit: true))
            .ShouldHaveValidationErrorFor(x => x.ChequeNumber);
        validator.TestValidate(new RecordSupplierPaymentCommand(id, 10m, Paid, null, "cheque", ChequeNumber: "1", ChequeDateUtc: Paid.AddDays(30)))
            .IsValid.ShouldBeTrue();
    }
}
