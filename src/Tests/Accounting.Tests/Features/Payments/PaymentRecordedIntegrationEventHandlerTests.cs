using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.IntegrationEventHandlers;
using FSH.Modules.Customers.Contracts.Events;
using FSH.Modules.Suppliers.Contracts.Events;
using NSubstitute;

namespace Accounting.Tests.Features.Payments;

/// <summary>
/// Customer and supplier payment vouchers post to the money account that matches the payment method —
/// the same mapping expenses use: cash (or no method, e.g. an event queued before the method was carried)
/// → Cash 1000; bank, cheque, card, online wallets … → Bank 1010.
/// </summary>
public sealed class PaymentRecordedIntegrationEventHandlerTests : IDisposable
{
    private static readonly Guid CashId = Guid.CreateVersion7();
    private static readonly Guid BankId = Guid.CreateVersion7();
    private static readonly Guid ArId = Guid.CreateVersion7();
    private static readonly Guid ApId = Guid.CreateVersion7();

    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();
    private readonly IVoucherPostingService _posting = Substitute.For<IVoucherPostingService>();
    private readonly IAccountingAccountResolver _resolver = Substitute.For<IAccountingAccountResolver>();

    public PaymentRecordedIntegrationEventHandlerTests()
    {
        _resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Cash, Arg.Any<CancellationToken>()).Returns(CashId);
        _resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Bank, Arg.Any<CancellationToken>()).Returns(BankId);
        _resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.AccountsReceivable, Arg.Any<CancellationToken>()).Returns(ArId);
        _resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.AccountsPayable, Arg.Any<CancellationToken>()).Returns(ApId);
    }

    public void Dispose() => _db.Dispose();

    public static TheoryData<string?, bool> Methods => new()
    {
        { null, true },
        { "", true },
        { "cash", true },
        { " CASH ", true },
        { "bank", false },
        { "cheque", false },
        { "card", false },
        { "online", false },
        { "esewa", false },
        { "khalti", false },
        { "fonepay", false },
    };

    [Theory]
    [MemberData(nameof(Methods))]
    public async Task CustomerPayment_Should_Debit_MoneyAccount_ForMethod(string? method, bool expectCash)
    {
        var handler = new CustomerPaymentRecordedIntegrationEventHandler(_posting, _resolver, TestPaymentAccounts.For(_resolver), _db);
        var evt = new CustomerPaymentRecordedIntegrationEvent(
            Guid.NewGuid(), DateTime.UtcNow, "t", "c", "Customers", Guid.NewGuid(), Guid.NewGuid(), "Ram", 150m, null,
            PaymentMethod: method);

        await handler.HandleAsync(evt);

        Guid expected = expectCash ? CashId : BankId;
        await _posting.Received(1).PostSystemVoucherAsync(
            Arg.Is<PostVoucherRequest>(r =>
                r.Lines.Count == 2
                && r.Lines[0].AccountId == expected && r.Lines[0].DebitAmount == 150m
                && r.Lines[1].AccountId == ArId && r.Lines[1].CreditAmount == 150m),
            Arg.Any<CancellationToken>());
    }

    [Theory]
    [MemberData(nameof(Methods))]
    public async Task SupplierPayment_Should_Credit_MoneyAccount_ForMethod(string? method, bool expectCash)
    {
        var handler = new SupplierPaymentRecordedIntegrationEventHandler(_posting, _resolver, TestPaymentAccounts.For(_resolver), _db);
        var evt = new SupplierPaymentRecordedIntegrationEvent(
            Guid.NewGuid(), DateTime.UtcNow, "t", "c", "Suppliers", Guid.NewGuid(), Guid.NewGuid(), "Acme", 80m, "bill 12",
            PaymentMethod: method);

        await handler.HandleAsync(evt);

        Guid expected = expectCash ? CashId : BankId;
        await _posting.Received(1).PostSystemVoucherAsync(
            Arg.Is<PostVoucherRequest>(r =>
                r.Lines.Count == 2
                && r.Lines[0].AccountId == ApId && r.Lines[0].DebitAmount == 80m
                && r.Lines[1].AccountId == expected && r.Lines[1].CreditAmount == 80m),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Payments_Should_DateVoucher_AtThePaymentDate_NotWhenTheEventWasRaised()
    {
        var raised = new DateTime(2026, 6, 20, 8, 0, 0, DateTimeKind.Utc);
        var paid = new DateTime(2026, 6, 14, 0, 0, 0, DateTimeKind.Utc);

        await new CustomerPaymentRecordedIntegrationEventHandler(_posting, _resolver, TestPaymentAccounts.For(_resolver), _db).HandleAsync(
            new CustomerPaymentRecordedIntegrationEvent(
                Guid.NewGuid(), raised, "t", "c", "Customers", Guid.NewGuid(), Guid.NewGuid(), "Ram", 150m, null, PaymentDateUtc: paid));
        await new SupplierPaymentRecordedIntegrationEventHandler(_posting, _resolver, TestPaymentAccounts.For(_resolver), _db).HandleAsync(
            new SupplierPaymentRecordedIntegrationEvent(
                Guid.NewGuid(), raised, "t", "c", "Suppliers", Guid.NewGuid(), Guid.NewGuid(), "Acme", 80m, null, PaymentDateUtc: paid));

        await _posting.Received(2).PostSystemVoucherAsync(
            Arg.Is<PostVoucherRequest>(r => r.VoucherDateUtc == paid), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Payments_Should_FallBackToOccurredOn_ForEventsWithoutAPaymentDate()
    {
        var raised = new DateTime(2026, 6, 20, 8, 0, 0, DateTimeKind.Utc);

        await new CustomerPaymentRecordedIntegrationEventHandler(_posting, _resolver, TestPaymentAccounts.For(_resolver), _db).HandleAsync(
            new CustomerPaymentRecordedIntegrationEvent(
                Guid.NewGuid(), raised, "t", "c", "Customers", Guid.NewGuid(), Guid.NewGuid(), "Ram", 150m, null));

        await _posting.Received(1).PostSystemVoucherAsync(
            Arg.Is<PostVoucherRequest>(r => r.VoucherDateUtc == raised), Arg.Any<CancellationToken>());
    }
}
